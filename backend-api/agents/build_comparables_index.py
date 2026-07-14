"""
Build the comparables index artifact from the cleaned listings (Phase 5).

Embeds each real Dubizzle listing with a free local bi-encoder (all-MiniLM-L6-v2)
and saves a compact, committable artifact the backend loads at startup. The same
rows + embeddings also seed Supabase pgvector in production (load_comparables_supabase.py).

Run:  USE_TF=0 python backend-api/agents/build_comparables_index.py
Reads:  data/processed/comparables.csv
Writes: backend-api/models/comparables_index.joblib   (metadata + float32 embeddings)
"""
from __future__ import annotations
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

SRC = Path("data/processed/comparables.csv")
OUT = Path(__file__).resolve().parents[1] / "models" / "comparables_index.joblib"
# fastembed ONNX model (no torch) — same weights as the sentence-transformers model,
# so the committed corpus embeddings and the runtime query embeddings match exactly.
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def listing_text(r: pd.Series) -> str:
    """Human/semantic representation of a listing for dense + sparse retrieval."""
    parts = [
        str(r.get("year", "")), str(r.get("make", "")), str(r.get("model", "")),
        str(r.get("bodyType", "")), f'{r.get("kilometers", "")} km',
        str(r.get("regionalSpecs", "")), str(r.get("transmissionType", "")),
        str(r.get("fuelType", "")), str(r.get("city", "")),
        f'{r.get("noOfCylinders", "")} cyl',
    ]
    return " ".join(p for p in parts if p and p != "nan").strip()


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}. Run data/prepare_tabular.py first.")
    from fastembed import TextEmbedding

    df = pd.read_csv(SRC)
    df["_text"] = df.apply(listing_text, axis=1)
    print(f"embedding {len(df)} listings with fastembed {EMBED_MODEL} ...")

    model = TextEmbedding(model_name=EMBED_MODEL)
    emb = np.asarray(list(model.embed(df["_text"].tolist())), dtype="float32")
    # fastembed returns L2-normalized vectors, so cosine == dot product

    keep = [c for c in [
        "listing_id", "title", "url", "make", "model", "year", "kilometers",
        "bodyType", "transmissionType", "fuelType", "regionalSpecs",
        "noOfCylinders", "city", "neighbourhood", "sellerType", "price",
    ] if c in df.columns]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "embed_model": EMBED_MODEL,
        "records": df[keep].to_dict("records"),
        "texts": df["_text"].tolist(),
        "embeddings": emb,          # (n, 384) float32, L2-normalized
        "dim": int(emb.shape[1]),
    }, OUT, compress=3)
    print(f"wrote {OUT}  ({OUT.stat().st_size/1e6:.2f} MB, {emb.shape[0]}x{emb.shape[1]})")


if __name__ == "__main__":
    main()
