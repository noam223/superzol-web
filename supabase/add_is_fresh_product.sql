-- ============================================================
-- Add is_fresh_product flag to product_groups
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

ALTER TABLE public.product_groups
  ADD COLUMN IF NOT EXISTS is_fresh_product BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_product_groups_is_fresh
  ON public.product_groups (is_fresh_product)
  WHERE is_fresh_product = TRUE;

-- Allow admin to update the new column (already covered by existing update policy)
-- No new policy needed — existing "admin update product_groups" policy covers all columns.
