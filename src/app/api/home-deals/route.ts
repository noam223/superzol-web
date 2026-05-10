import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108';
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
const TYPESENSE_KEY = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY!;

const PRODUCTS_INDEX = 'products_index';

// Server-side Supabase client for reading featured_items
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PromoItem = {
  id: string;
  item_code: string;
  item_name: string;
  min_price: number;
  promo_price?: number;
  promo_description?: string;
  cheapest_chain_name?: string;
  has_promotion?: boolean;
  is_featured?: boolean;
};

async function fetchFromIndex(perPage: number, sortBy: string, filterBy?: string): Promise<PromoItem[]> {
  try {
    const params = new URLSearchParams({
      q: '*',
      query_by: 'item_name',
      filter_by: filterBy || 'has_promotion:=true',
      per_page: perPage.toString(),
      sort_by: sortBy,
    });

    const res = await fetch(
      `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${PRODUCTS_INDEX}/documents/search?${params}`,
      {
        headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_KEY },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || [])
      .map((h: { document: PromoItem }) => h.document as PromoItem)
      .filter((d: PromoItem) => d.item_code && d.item_name);
  } catch {
    return [];
  }
}

async function fetchSingleFromIndex(itemCode: string): Promise<PromoItem | null> {
  try {
    const res = await fetch(
      `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${PRODUCTS_INDEX}/documents/${encodeURIComponent(itemCode)}`,
      {
        headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_KEY },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    const doc = await res.json();
    if (doc?.error || !doc?.item_code) return null;
    return doc as PromoItem;
  } catch {
    return null;
  }
}

export async function GET() {
  // 1. Fetch admin-featured items from Supabase
  const { data: featuredRows } = await supabase
    .from('featured_items')
    .select('item_code, item_name, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(20);

  // 2. Fetch each featured item from Typesense products_index
  const featuredItems: PromoItem[] = [];
  if (featuredRows && featuredRows.length > 0) {
    const fetched = await Promise.all(
      featuredRows.map(row => fetchSingleFromIndex(row.item_code))
    );
    for (const item of fetched) {
      if (item) featuredItems.push({ ...item, is_featured: true });
    }
  }

  // 3. Fetch hot deals (lowest promo price)
  const hotDeals = await fetchFromIndex(20, 'promo_price:asc');

  // 4. Fetch all promos for variety carousel
  const allPromos = await fetchFromIndex(20, 'min_price:asc');
  const shuffled = [...allPromos].sort(() => Math.random() - 0.5).slice(0, 16);

  // 5. Remove featured items from hotDeals to avoid duplicates
  const featuredCodes = new Set(featuredItems.map(f => f.item_code));
  const filteredHotDeals = hotDeals.filter(d => !featuredCodes.has(d.item_code)).slice(0, 16);

  return NextResponse.json(
    {
      featuredItems,
      hotDeals: filteredHotDeals,
      allPromos: shuffled,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
