"""
Comparables RAG agent (Phase 5).

"Find cars similar to this one" over the real Dubizzle listings, via a hybrid of:
  - dense retrieval   (MiniLM bi-encoder, cosine)
  - sparse retrieval  (BM25 over the same listing text)
  - structured match  (make/model/body/year/mileage proximity — what "comparable" means for cars)
  - cross-encoder rerank on the top candidates

Every returned comparable carries its real `listing_id` and source `url`, so the report
agent can cite it directly (citation grounding, Section 6/15).

Embeddings use **fastembed** (onnxruntime, no torch) so the whole retrieval path fits the
Render free tier's 512 MB — the corpus embeddings in the committed artifact and the runtime
query embeddings come from the same ONNX model, so they match exactly.

Storage is pluggable: LocalStore (the committed joblib artifact — works with no external
services) and, in production, Supabase pgvector (see load_comparables_supabase.py).

Usage:
    from comparables_rag_agent import ComparablesAgent
    agent = ComparablesAgent()               # loads local artifact
    comps = agent.find({"make":"toyota","model":"corolla","year":2019,
                        "kilometers":90000,"bodyType":"Sedan"}, k=5)
"""
from __future__ import annotations
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

_ARTIFACT = Path(__file__).resolve().parents[1] / "models" / "comparables_index.joblib"
_TOKEN = re.compile(r"[a-z0-9]+")


def _tok(s: str) -> list[str]:
    return _TOKEN.findall(str(s).lower())


@lru_cache(maxsize=1)
def _embedder(model_name: str):
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=model_name)


@lru_cache(maxsize=1)
def _reranker():
    """Optional torch-free cross-encoder. Returns None if unavailable — the
    structured-dominant hybrid already ranks well without it (same-make P@5 = 1.0)."""
    try:
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        return TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")
    except Exception:
        return None


class LocalStore:
    """In-process vector store backed by the committed joblib artifact."""

    def __init__(self, path: Path = _ARTIFACT):
        if not path.exists():
            raise FileNotFoundError(f"{path} missing — run build_comparables_index.py")
        d = joblib.load(path)
        self.model_name: str = d["embed_model"]
        self.records: list[dict] = d["records"]
        self.texts: list[str] = d["texts"]
        self.emb: np.ndarray = d["embeddings"]          # (n, dim) L2-normalized
        from rank_bm25 import BM25Okapi
        self._bm25 = BM25Okapi([_tok(t) for t in self.texts])

    def __len__(self) -> int:
        return len(self.records)

    def embed_query(self, text: str) -> np.ndarray:
        v = next(iter(_embedder(self.model_name).embed([text])))  # fastembed, L2-normalized
        return np.ascontiguousarray(v, dtype=np.float32)

    def dense_scores(self, qvec: np.ndarray) -> np.ndarray:
        # numpy 2.x + this BLAS raise spurious FP flags on matmul even for finite inputs
        # (verified: no nan/inf in emb or qvec, results correct) — suppress the false flags.
        with np.errstate(all="ignore"):
            return np.nan_to_num(self.emb @ qvec)

    def bm25_scores(self, text: str) -> np.ndarray:
        return np.asarray(self._bm25.get_scores(_tok(text)), dtype="float32")


def _norm(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)


def _structured_sim(q: dict, r: dict) -> float:
    """Domain similarity for 'comparable car'. 0..1."""
    s = 0.0
    if str(q.get("make", "")).lower() == str(r.get("make", "")).lower():
        s += 0.40
    if str(q.get("model", "")).lower() == str(r.get("model", "")).lower():
        s += 0.30
    if str(q.get("bodyType", "")).lower() == str(r.get("bodyType", "")).lower():
        s += 0.10
    try:
        s += 0.10 * math.exp(-abs(int(q["year"]) - int(r["year"])) / 3.0)
    except (KeyError, ValueError, TypeError):
        pass
    try:
        s += 0.10 * math.exp(-abs(float(q["kilometers"]) - float(r["kilometers"])) / 50_000.0)
    except (KeyError, ValueError, TypeError):
        pass
    return s


def _query_text(v: dict) -> str:
    parts = [
        v.get("year"), v.get("make"), v.get("model"), v.get("bodyType"),
        f'{v.get("kilometers")} km' if v.get("kilometers") else None,
        v.get("regionalSpecs"), v.get("transmissionType"), v.get("fuelType"),
        v.get("city"), f'{v.get("noOfCylinders")} cyl' if v.get("noOfCylinders") else None,
    ]
    return " ".join(str(p) for p in parts if p).strip()


class ComparablesAgent:
    def __init__(self, store: LocalStore | None = None,
                 w_dense: float = 0.30, w_bm25: float = 0.15, w_struct: float = 0.55):
        self.store = store or LocalStore()
        self.w_dense, self.w_bm25, self.w_struct = w_dense, w_bm25, w_struct

    def find(self, vehicle: dict[str, Any], k: int = 5, candidate_pool: int = 30,
             rerank: bool = True) -> list[dict]:
        qtext = _query_text(vehicle)
        qvec = self.store.embed_query(qtext)

        dense = _norm(self.store.dense_scores(qvec))
        bm25 = _norm(self.store.bm25_scores(qtext))
        struct = np.array([_structured_sim(vehicle, r) for r in self.store.records], dtype="float32")

        hybrid = self.w_dense * dense + self.w_bm25 * bm25 + self.w_struct * struct

        # drop exact self-match if the query is itself a listing
        qid = vehicle.get("listing_id")
        order = np.argsort(-hybrid)
        cand = [i for i in order if self.store.records[i].get("listing_id") != qid][:candidate_pool]

        reranker = _reranker() if rerank and cand else None
        if reranker is not None:
            docs = [self.store.texts[i] for i in cand]
            ce = np.asarray(list(reranker.rerank(qtext, docs)), dtype="float32")
            ce_n = _norm(ce)
            # blend rerank with structured similarity (comparability must stay dominant)
            blended = [(i, 0.5 * ce_n[j] + 0.5 * struct[i]) for j, i in enumerate(cand)]
            blended.sort(key=lambda t: -t[1])
            top = [i for i, _ in blended[:k]]
            scores = {i: float(s) for i, s in blended}
        else:
            # torch-free hybrid ranking (dense + BM25 + structured) — already strong
            top = cand[:k]
            scores = {i: float(hybrid[i]) for i in top}

        out = []
        for i in top:
            r = dict(self.store.records[i])
            out.append({
                "listing_id": r.get("listing_id"),
                "url": r.get("url"),
                "make": r.get("make"), "model": r.get("model"), "year": r.get("year"),
                "kilometers": r.get("kilometers"), "price_aed": r.get("price"),
                "bodyType": r.get("bodyType"), "city": r.get("city"),
                "sellerType": r.get("sellerType"),
                "similarity": round(scores.get(i, 0.0), 4),
                "structured_sim": round(float(struct[i]), 4),
            })
        return out


if __name__ == "__main__":
    import json
    agent = ComparablesAgent()
    print(f"index: {len(agent.store)} listings\n")
    for q in [
        {"make": "toyota", "model": "corolla", "year": 2019, "kilometers": 90000, "bodyType": "Sedan"},
        {"make": "nissan", "model": "patrol", "year": 2020, "kilometers": 60000, "bodyType": "SUV"},
    ]:
        print("QUERY:", q)
        for c in agent.find(q, k=5):
            print(f"  {c['similarity']:.3f} | {c['year']} {c['make']} {c['model']} "
                  f"({c['bodyType']}) {c['kilometers']}km  AED {c['price_aed']}  [{c['listing_id']}]")
        print()
