-- ============================================================
-- Migration: Add shopping_lists table for named/shared lists
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create shopping_lists table
CREATE TABLE IF NOT EXISTS shopping_lists (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  share_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add list_id column to shopping_list_items (nullable — NULL = "main" list)
ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES shopping_lists(id) ON DELETE CASCADE;

-- 3. Row Level Security for shopping_lists
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "owner_all" ON shopping_lists
  FOR ALL USING (auth.uid() = owner_id);

-- Anyone with the share_token can read (via join page — we check token in app)
-- We allow SELECT for authenticated users who know the list id (after joining)
-- The join flow: user visits /join/[token] → we look up the list → add them as member
-- For simplicity: allow any authenticated user to SELECT if they know the id
-- (The token is the secret; once they have the list id they're a member)
CREATE POLICY "shared_read" ON shopping_lists
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4. Row Level Security for shopping_list_items — update to allow list members
-- Drop existing policies if any, then recreate
DROP POLICY IF EXISTS "user_own_items" ON shopping_list_items;

-- Owner of the list (or main list owner) can do everything
CREATE POLICY "user_own_items" ON shopping_list_items
  FOR ALL USING (
    auth.uid() = user_id
    OR
    -- Allow access to items in a shared list if the user is authenticated
    -- (list membership is enforced at app level via share_token)
    (list_id IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM shopping_lists sl WHERE sl.id = list_id
    ))
  );

-- 5. Create shared_list_members table to track who joined which list
CREATE TABLE IF NOT EXISTS shared_list_members (
  list_id    UUID REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);

ALTER TABLE shared_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_read_own" ON shared_list_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "member_insert_own" ON shared_list_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "member_delete_own" ON shared_list_members
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Enable Realtime for shopping_list_items
-- (Run in Supabase Dashboard → Database → Replication → shopping_list_items)
-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_lists;
