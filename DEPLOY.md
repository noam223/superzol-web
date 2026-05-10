# Deploy Guide — Superzol Web

## 🚀 Fast Deploy (after GitHub is connected to Vercel)

```bash
cd superzol-web
git add -A
git commit -m "describe your change"
git push
```
Vercel auto-deploys in ~1 minute. No upload needed.

---

## One-time Setup: Connect GitHub to Vercel

1. Go to https://vercel.com/dashboard
2. Find the `superzol-web` project → **Settings** → **Git**
3. Click **Connect Git Repository** → select `noam223/superzol-web`
4. Root Directory: `.`
5. Save → done!

---

## Fallback: Manual Deploy (no git)

```bash
cd superzol-web
npm run build          # verify build passes
vercel --prod --archive=tgz   # uploads ~250MB, takes ~5 min
```

---

## Environment Variables (set in Vercel dashboard)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_TYPESENSE_HOST` | Typesense server IP |
| `NEXT_PUBLIC_TYPESENSE_PORT` | Typesense port (8108) |
| `NEXT_PUBLIC_TYPESENSE_PROTOCOL` | http or https |
| `NEXT_PUBLIC_TYPESENSE_SEARCH_KEY` | Public search-only API key |
| `TYPESENSE_ADMIN_KEY` | Admin key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

---

## GitHub Repository

https://github.com/noam223/superzol-web
