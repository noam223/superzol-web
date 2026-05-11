import { NextRequest, NextResponse } from 'next/server';

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108';
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
const TYPESENSE_SEARCH_KEY = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY!;

// Proxy all Typesense requests server-side to avoid mixed-content (HTTPS → HTTP)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection') || 'products_index';
  const docId = searchParams.get('doc_id'); // for single document lookup

  let url: string;

  if (docId) {
    // Single document lookup: GET /collections/{col}/documents/{id}
    url = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${collection}/documents/${encodeURIComponent(docId)}`;
  } else {
    // Search: forward all params except 'collection' and 'doc_id'
    const tsParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'collection' && key !== 'doc_id') {
        tsParams.set(key, value);
      }
    });
    url = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${collection}/documents/search?${tsParams}`;
  }

  try {
    const res = await fetch(url, {
      headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY },
      cache: 'no-store',
    });

    const data = await res.json();
    // For doc lookups (doc_id), return 404 as empty rather than propagating error status
    if (!res.ok) {
      if (docId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ hits: [], found: 0 }, { status: 200 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('Typesense proxy error:', err);
    if (docId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ hits: [], found: 0 }, { status: 200 });
  }
}

// For facet queries (used by getProductPrices)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { collection, path, params } = body;

  const tsParams = new URLSearchParams(params);
  const url = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${collection}${path || '/documents/search'}?${tsParams}`;

  try {
    const res = await fetch(url, {
      headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Typesense proxy error:', err);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
