-- ─────────────────────────────────────────────────────────────────────────────
-- RAG System — Supabase Database Setup
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Enable the pgvector extension
-- This must be enabled before creating vector columns
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Create the documents table
-- Stores each text chunk alongside its 1536-dim OpenAI embedding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT        NOT NULL,
  embedding   VECTOR(1536) NOT NULL,
  source      TEXT,                          -- filename or document identifier
  metadata    JSONB       DEFAULT '{}',      -- optional: page number, section, etc.
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast cosine similarity search using IVFFlat
-- ⚠️ WARNING: DO NOT BUILD THIS INDEX on empty or small tables (< 50,000 rows).
-- Building `ivfflat` before inserting data causes poor clustering and breaks `match_documents`
-- (it will return 0 results). Exact nearest neighbor search is extremely fast for small tables.
-- Uncomment and build this ONLY AFTER you have inserted a reasonable number of rows (e.g., 100,000+).
-- 
-- CREATE INDEX IF NOT EXISTS documents_embedding_idx
--   ON documents
--   USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Create the match_documents RPC function
-- Used by the query pipeline to retrieve the most relevant document chunks
-- Parameters:
--   query_embedding  — the 1536-dim embedding of the user's question
--   match_threshold  — minimum cosine similarity score (0.0–1.0), default 0.5
--   match_count      — how many results to return, default 5
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  VECTOR(1536),
  match_threshold  FLOAT DEFAULT 0.5,
  match_count      INT   DEFAULT 5
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  source      TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.source,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding  -- ascending = most similar first
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Grant access to the anon role (required for Supabase client access)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON documents TO anon;
GRANT EXECUTE ON FUNCTION match_documents TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run these after setup to confirm everything is working:
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT * FROM documents LIMIT 5;
-- SELECT * FROM match_documents('[0.1, 0.2, ...]'::vector, 0.5, 3);
