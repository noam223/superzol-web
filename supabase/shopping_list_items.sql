-- ============================================================
-- shopping_list_items table
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_code   TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  checked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user_id
  ON public.shopping_list_items (user_id);

-- Enable Row Level Security
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own items
CREATE POLICY "Users can view own items"
  ON public.shopping_list_items
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own items
CREATE POLICY "Users can insert own items"
  ON public.shopping_list_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own items
CREATE POLICY "Users can update own items"
  ON public.shopping_list_items
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: users can delete their own items
CREATE POLICY "Users can delete own items"
  ON public.shopping_list_items
  FOR DELETE
  USING (auth.uid() = user_id);
