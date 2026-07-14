"""
Load the comparables index into Supabase pgvector (Phase 5, production backend).

Reads the SAME committed artifact the local backend uses (comparables_index.joblib),
so local and production serve byte-identical rows + embeddings. Idempotent upsert.

Prereqs (set in .env / platform env, never committed):
    SUPABASE_DB_URL   postgres connection string (Settings -> Database)
Run once the Supabase project exists:
    python backend-api/agents/load_comparables_supabase.py --create-schema
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path

import joblib

_ARTIFACT = Path(__file__).resolve().parents[1] / "models" / "comparables_index.joblib"
_SCHEMA = Path(__file__).with_name("supabase_comparables_schema.sql")


def _conn():
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise SystemExit("Set SUPABASE_DB_URL (Supabase Settings -> Database) before loading.")
    import psycopg  # psycopg3
    return psycopg.connect(url)


def _vec_literal(v) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--create-schema", action="store_true",
                    help="run the schema SQL before loading")
    args = ap.parse_args()

    if not _ARTIFACT.exists():
        raise SystemExit(f"{_ARTIFACT} missing — run build_comparables_index.py first.")
    d = joblib.load(_ARTIFACT)
    records, texts, emb = d["records"], d["texts"], d["embeddings"]
    assert emb.shape[1] == 384, f"expected 384-dim, got {emb.shape[1]}"

    with _conn() as conn, conn.cursor() as cur:
        if args.create_schema:
            cur.execute(_SCHEMA.read_text())
            print("schema applied")

        rows = 0
        for r, doc, e in zip(records, texts, emb):
            cur.execute(
                """
                insert into comparables (listing_id,title,url,make,model,year,kilometers,
                    body_type,transmission,fuel_type,regional_specs,cylinders,city,
                    seller_type,price_aed,doc,embedding)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)
                on conflict (listing_id) do update set
                    price_aed=excluded.price_aed, embedding=excluded.embedding, doc=excluded.doc
                """,
                (
                    str(r.get("listing_id")), r.get("title"), r.get("url"),
                    r.get("make"), r.get("model"),
                    _int(r.get("year")), _int(r.get("kilometers")),
                    r.get("bodyType"), r.get("transmissionType"), r.get("fuelType"),
                    r.get("regionalSpecs"), _int(r.get("noOfCylinders")), r.get("city"),
                    r.get("sellerType"), _num(r.get("price")), doc, _vec_literal(e),
                ),
            )
            rows += 1
        conn.commit()
        print(f"upserted {rows} comparables into Supabase pgvector")


def _int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    main()
