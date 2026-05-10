-- ============================================================
-- Migration: add group_id column to shopping_list_items
-- Run this AFTER product_groups.sql in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES public.product_groups(id)
    ON DELETE SET NULL;

-- Index for fast group lookups
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_group_id
  ON public.shopping_list_items (group_id);
