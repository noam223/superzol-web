-- ============================================================
-- featured_items table
-- Admin-curated products pinned to the home page.
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.featured_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code  TEXT NOT NULL UNIQUE,
  item_name  TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for ordered display
CREATE INDEX IF NOT EXISTS idx_featured_items_sort
  ON public.featured_items (sort_order ASC, created_at ASC)
  WHERE active = TRUE;

-- Enable Row Level Security
ALTER TABLE public.featured_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read featured items (shown on home page)
CREATE POLICY "public read featured_items"
  ON public.featured_items
  FOR SELECT
  USING (true);

-- Only admin (noamnisim@gmail.com) can write
CREATE POLICY "admin insert featured_items"
  ON public.featured_items
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

CREATE POLICY "admin update featured_items"
  ON public.featured_items
  FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

CREATE POLICY "admin delete featured_items"
  ON public.featured_items
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');
