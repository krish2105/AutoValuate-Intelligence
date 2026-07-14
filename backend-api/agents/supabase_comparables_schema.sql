-- AutoValuate — comparables pgvector schema (Phase 5, production backend)
-- Run once in the Supabase SQL editor (or via load_comparables_supabase.py which execs it).
-- Mirrors the local joblib index: same rows, same 384-dim MiniLM embeddings.

create extension if not exists vector;

create table if not exists comparables (
    listing_id      text primary key,
    title           text,
    url             text,
    make            text,
    model           text,
    year            int,
    kilometers      int,
    body_type       text,
    transmission    text,
    fuel_type       text,
    regional_specs  text,
    cylinders       int,
    city            text,
    seller_type     text,
    price_aed       numeric,
    doc             text,               -- the text used for embedding / BM25
    embedding       vector(384)
);

-- ANN index for cosine distance (embeddings are L2-normalized, so cosine == dot)
create index if not exists comparables_embedding_idx
    on comparables using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- helpful structured filters
create index if not exists comparables_make_model_idx on comparables (make, model);
create index if not exists comparables_year_idx on comparables (year);

-- Dense candidate retrieval: returns the top-N nearest listings for a query embedding,
-- optionally pre-filtered by make. The Python agent then applies BM25 + structured
-- reranking on this candidate pool (identical logic to the local backend).
create or replace function match_comparables(
    query_embedding vector(384),
    match_count int default 30,
    filter_make text default null
)
returns table (
    listing_id text, title text, url text, make text, model text,
    year int, kilometers int, body_type text, city text,
    seller_type text, price_aed numeric, doc text, similarity float
)
language sql stable as $$
    select c.listing_id, c.title, c.url, c.make, c.model, c.year, c.kilometers,
           c.body_type, c.city, c.seller_type, c.price_aed, c.doc,
           1 - (c.embedding <=> query_embedding) as similarity
    from comparables c
    where filter_make is null or c.make = filter_make
    order by c.embedding <=> query_embedding
    limit match_count;
$$;
