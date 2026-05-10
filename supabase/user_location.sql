-- ============================================================
-- user_location table
-- Stores each user's saved location (one row per user).
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_location (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat        FLOAT8 NOT NULL,
  lng        FLOAT8 NOT NULL,
  label      TEXT,           -- e.g. "תל אביב", "GPS"
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_location ENABLE ROW LEVEL SECURITY;

-- Users can only read their own location
CREATE POLICY "Users can read own location"
  ON public.user_location
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own location
CREATE POLICY "Users can insert own location"
  ON public.user_location
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own location
CREATE POLICY "Users can update own location"
  ON public.user_location
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own location
CREATE POLICY "Users can delete own location"
  ON public.user_location
  FOR DELETE
  USING (auth.uid() = user_id);
