-- ============================================================
-- product_groups + product_group_items tables
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

-- 1. Groups table
CREATE TABLE IF NOT EXISTS public.product_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Group items table (one row per barcode per group)
CREATE TABLE IF NOT EXISTS public.product_group_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  item_code  TEXT NOT NULL,
  item_name  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, item_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_group_items_group_id
  ON public.product_group_items (group_id);

CREATE INDEX IF NOT EXISTS idx_product_group_items_item_code
  ON public.product_group_items (item_code);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.product_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_group_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read groups
CREATE POLICY "public read product_groups"
  ON public.product_groups
  FOR SELECT
  USING (true);

CREATE POLICY "public read product_group_items"
  ON public.product_group_items
  FOR SELECT
  USING (true);

-- Only admin (noamnisim@gmail.com) can write to product_groups
CREATE POLICY "admin insert product_groups"
  ON public.product_groups
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

CREATE POLICY "admin update product_groups"
  ON public.product_groups
  FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

CREATE POLICY "admin delete product_groups"
  ON public.product_groups
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

-- Only admin can write to product_group_items
CREATE POLICY "admin insert product_group_items"
  ON public.product_group_items
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');

CREATE POLICY "admin delete product_group_items"
  ON public.product_group_items
  FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'noamnisim@gmail.com');
