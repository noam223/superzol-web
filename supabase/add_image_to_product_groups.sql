-- Add image_item_code column to product_groups
-- This stores the item_code of the product whose image represents the group.
-- Auto-set to the first item added; admin can change it to any item in the group.

ALTER TABLE public.product_groups
  ADD COLUMN IF NOT EXISTS image_item_code TEXT DEFAULT NULL;
