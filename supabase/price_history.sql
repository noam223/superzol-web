-- ============================================================
-- price_history table
-- Stores daily price snapshots per item per chain.
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_history (
  id          BIGSERIAL PRIMARY KEY,
  item_code   TEXT NOT NULL,
  chain_id    TEXT NOT NULL,
  price       FLOAT8 NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (item_code, chain_id, recorded_at)
);

-- Fast lookup by item + date
CREATE INDEX IF NOT EXISTS idx_price_history_item_date
  ON public.price_history (item_code, recorded_at DESC);

-- Enable Row Level Security
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Anyone can read price history (public data)
CREATE POLICY "public read price_history"
  ON public.price_history
  FOR SELECT
  USING (true);

-- Only service role (pipeline) can insert/update — no client write policy needed
-- The pipeline uses SUPABASE_SERVICE_KEY which bypasses RLS
