# SuperZol - Vercel Deployment Guide

## Prerequisites
- Vercel account at https://vercel.com
- Vercel CLI: `npm install -g vercel`

## Deploy Steps

### Step 1: Login to Vercel
```bash
cd superzol-web
vercel login
```

### Step 2: Set Environment Variables (CLI - fastest)
```bash
cd superzol-web
vercel env add NEXT_PUBLIC_TYPESENSE_HOST production
# Enter: 178.105.52.131

vercel env add NEXT_PUBLIC_TYPESENSE_PORT production
# Enter: 8108

vercel env add NEXT_PUBLIC_TYPESENSE_PROTOCOL production
# Enter: http

vercel env add NEXT_PUBLIC_TYPESENSE_SEARCH_KEY production
# Enter: superzol-ts-key-2024

vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Enter: https://cnuzfkqjirmabbifwljy.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Enter: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNudXpma3FqaXJtYWJiaWZ3bGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzE1MDQsImV4cCI6MjA5MzY0NzUwNH0.EogOLeIDJR6aBFan3Ej5uX0GqFCGWCfCBrBTpc1oqqE
```

### Step 3: Deploy
```bash
cd superzol-web
vercel --prod
```

When prompted:
- Set up and deploy: **Y**
- Which scope: your account
- Link to existing project: **N**
- Project name: **superzol**
- Directory: **./** (current)
- Override settings: **N**

---

### Alternative: Dashboard env vars

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_TYPESENSE_HOST` | `178.105.52.131` |
| `NEXT_PUBLIC_TYPESENSE_PORT` | `8108` |
| `NEXT_PUBLIC_TYPESENSE_PROTOCOL` | `http` |
| `NEXT_PUBLIC_TYPESENSE_SEARCH_KEY` | `superzol-ts-key-2024` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cnuzfkqjirmabbifwljy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNudXpma3FqaXJtYWJiaWZ3bGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzE1MDQsImV4cCI6MjA5MzY0NzUwNH0.EogOLeIDJR6aBFan3Ej5uX0GqFCGWCfCBrBTpc1oqqE` |

---

## Supabase Setup (Required before first login)

Run this SQL in Supabase SQL Editor:
https://supabase.com/dashboard/project/cnuzfkqjirmabbifwljy/sql

```sql
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_code   TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  checked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user_id
  ON public.shopping_list_items (user_id);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items" ON public.shopping_list_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own items" ON public.shopping_list_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON public.shopping_list_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON public.shopping_list_items
  FOR DELETE USING (auth.uid() = user_id);
```

## After Deployment

1. Update Supabase Auth → URL Configuration:
   - Site URL: `https://superzol.vercel.app`
   - Redirect URLs: `https://superzol.vercel.app/**`

2. Test the app at your Vercel URL

## App Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Hot deals carousel + promotions |
| Search | `/search` | Search 555k+ products |
| Product | `/product/[itemCode]` | Price comparison by chain |
| Promotions | `/promotions` | All active promotions |
| Shopping List | `/shopping-list` | Personal shopping list |
| Compare | `/compare` | Basket comparison by chain |
| History | `/history` | Recently viewed products |
| Profile | `/profile` | User account |
