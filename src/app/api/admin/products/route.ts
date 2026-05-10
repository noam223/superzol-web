import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'noamnisim@gmail.com';

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108';
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
// Admin key — server-side only, never exposed to client
const TYPESENSE_ADMIN_KEY = process.env.TYPESENSE_ADMIN_KEY!;

const TS_BASE = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}`;
const PRODUCTS_INDEX = 'products_index';

// Supabase server client to verify the caller's JWT
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Auth guard: verify caller is admin ──────────────────────────────────────
async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;
  return user.email === ADMIN_EMAIL;
}

/**
 * PATCH /api/admin/products
 * Body: { item_code: string, item_name?: string, search_tags?: string[] }
 * Updates a product in products_index (name and/or search tags).
 */
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { item_code, item_name, search_tags } = body as {
    item_code: string;
    item_name?: string;
    search_tags?: string[];
  };

  if (!item_code) {
    return NextResponse.json({ error: 'Missing item_code' }, { status: 400 });
  }

  // Build partial update document
  const update: Record<string, unknown> = { id: item_code };
  if (item_name !== undefined) update.item_name = item_name;
  if (search_tags !== undefined) update.search_tags = search_tags;

  try {
    const res = await fetch(
      `${TS_BASE}/collections/${PRODUCTS_INDEX}/documents/${encodeURIComponent(item_code)}`,
      {
        method: 'PATCH',
        headers: {
          'X-TYPESENSE-API-KEY': TYPESENSE_ADMIN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Typesense PATCH error:', err);
      return NextResponse.json({ error: 'Typesense update failed', detail: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, document: data });
  } catch (err) {
    console.error('Admin products PATCH error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/products?item_code=XXX
 * Deletes a product from products_index.
 */
export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const item_code = searchParams.get('item_code');

  if (!item_code) {
    return NextResponse.json({ error: 'Missing item_code' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${TS_BASE}/collections/${PRODUCTS_INDEX}/documents/${encodeURIComponent(item_code)}`,
      {
        method: 'DELETE',
        headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_ADMIN_KEY },
      }
    );

    if (!res.ok && res.status !== 404) {
      const err = await res.text();
      console.error('Typesense DELETE error:', err);
      return NextResponse.json({ error: 'Typesense delete failed', detail: err }, { status: res.status });
    }

    return NextResponse.json({ ok: true, deleted: item_code });
  } catch (err) {
    console.error('Admin products DELETE error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
