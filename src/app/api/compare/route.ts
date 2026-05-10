import { NextRequest, NextResponse } from 'next/server';

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108';
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
const TYPESENSE_SEARCH_KEY = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY!;

const TS_BASE = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}`;
const TS_HEADERS = { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY };

// Direct document fetch by ID
async function tsGetDoc(collection: string, docId: string) {
  const res = await fetch(
    `${TS_BASE}/collections/${collection}/documents/${encodeURIComponent(docId)}`,
    { headers: TS_HEADERS, cache: 'no-store' }
  );
  if (!res.ok) return null;
  const doc = await res.json();
  if (doc?.error) return null;
  return doc;
}

async function tsSearch(collection: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${TS_BASE}/collections/${collection}/documents/search?${qs}`, {
    headers: TS_HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Products use zero-padded 3-digit store IDs (e.g. "054")
// Stores CSV uses plain numbers ("54"). Try padded variants.
function storeIdVariants(storeId: string): string[] {
  const plain = String(parseInt(storeId, 10));
  const padded3 = plain.padStart(3, '0');
  return Array.from(new Set([padded3, plain, storeId]));
}

export type StoreResult = {
  store_key: string;
  chain_id: string;
  chain_name: string;
  store_id: string;
  store_name: string;
  lat: number;
  lng: number;
  distance_km: number;
  products_found: number;
  products_missing: number;
  total_price: number;
  items: ItemResult[];
};

export type ItemResult = {
  item_code: string;
  item_name: string;
  quantity: number;
  found: boolean;
  price: number | null;
  total: number | null;
  // Group item fields
  group_label?: string;       // Display name of the group (e.g. "שמן קנולה/חמניות")
  resolved_item_code?: string; // Actual barcode that was found (same as item_code when found)
};

// Input item type (supports both regular and group items)
type InputItem = {
  item_code: string;
  item_name: string;
  quantity: number;
  candidate_codes?: string[]; // For group items: all barcodes in the group
  group_label?: string;       // For group items: display name of the group
};

/**
 * POST /api/compare
 * Body: { lat, lng, radius_km, items: [{item_code, item_name, quantity, candidate_codes?, group_label?}] }
 * Returns: stores sorted by products_found DESC, total_price ASC
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng, radius_km = 15, items } = body as {
      lat: number;
      lng: number;
      radius_km?: number;
      items: InputItem[];
    };

    if (!lat || !lng || !items?.length) {
      return NextResponse.json({ error: 'Missing lat/lng/items' }, { status: 400 });
    }

    // 1. Find nearby stores using Typesense geo search
    const geoData = await tsSearch('stores', {
      q: '*',
      query_by: 'store_name',
      filter_by: `location:(${lat},${lng},${radius_km} km)`,
      per_page: '250',
      sort_by: `location(${lat},${lng}):asc`,
    });

    if (!geoData?.hits?.length) {
      return NextResponse.json({ stores: [], message: 'לא נמצאו חנויות באזור' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nearbyStores: Array<{
      chain_id: string; store_id: string; store_name: string; chain_name: string; lat: number; lng: number;
    }> = geoData.hits.map((h: any) => h.document); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 2. Group stores by chain
    const chainStoreMap: Record<string, typeof nearbyStores> = {};
    for (const store of nearbyStores) {
      if (!chainStoreMap[store.chain_id]) chainStoreMap[store.chain_id] = [];
      chainStoreMap[store.chain_id].push(store);
    }

    const storeResults: StoreResult[] = [];

    // 3. For each chain, for each store, look up all items
    await Promise.all(
      Object.entries(chainStoreMap).map(async ([chainId, stores]) => {
        const collection = `products_${chainId}`;
        const sidVariants = stores.map(s => ({ store: s, variants: storeIdVariants(s.store_id) }));

        // Use only regular items (non-group) for store_id variant resolution
        const regularItems = items.filter(i => !i.candidate_codes?.length);

        await Promise.all(
          sidVariants.map(async ({ store, variants }) => {
            // Resolve which store_id variant has data by checking multiple items
            let resolvedSid = variants[0];
            if (variants.length > 1 && regularItems.length > 0) {
              const testItems = regularItems.slice(0, 3);
              outer: for (const sid of variants) {
                for (const testItem of testItems) {
                  const testDoc = await tsGetDoc(collection, `${chainId}-${sid}-${testItem.item_code}`);
                  if (testDoc !== null) {
                    resolvedSid = sid;
                    break outer;
                  }
                }
              }
            }

            // Now look up all items in parallel using the resolved store_id
            const itemResults: ItemResult[] = [];
            let totalPrice = 0;
            let found = 0;

            await Promise.all(
              items.map(async (item) => {
                // ── GROUP ITEM: try all candidate codes, pick cheapest ──
                if (item.candidate_codes && item.candidate_codes.length > 0) {
                  // Try all candidates in parallel
                  const candidateResults = await Promise.all(
                    item.candidate_codes.map(async (code) => {
                      // Try resolved sid first
                      let doc = await tsGetDoc(collection, `${chainId}-${resolvedSid}-${code}`);
                      // Fallback to other variants
                      if (!doc || !(doc.item_price > 0)) {
                        for (const sid of variants) {
                          if (sid === resolvedSid) continue;
                          const altDoc = await tsGetDoc(collection, `${chainId}-${sid}-${code}`);
                          if (altDoc && altDoc.item_price > 0) {
                            doc = altDoc;
                            break;
                          }
                        }
                      }
                      if (doc && doc.item_price > 0) {
                        return { code, doc, price: doc.item_price as number };
                      }
                      return null;
                    })
                  );

                  // Filter to found candidates and pick cheapest
                  const validCandidates = candidateResults.filter(Boolean) as { code: string; doc: Record<string, unknown>; price: number }[];

                  if (validCandidates.length > 0) {
                    // Sort by price ascending, pick cheapest
                    validCandidates.sort((a, b) => a.price - b.price);
                    const cheapest = validCandidates[0];
                    const total = cheapest.price * item.quantity;
                    totalPrice += total;
                    found++;
                    itemResults.push({
                      item_code: cheapest.code,
                      item_name: (cheapest.doc.item_name as string) || item.group_label || item.item_name,
                      quantity: item.quantity,
                      found: true,
                      price: cheapest.price,
                      total,
                      group_label: item.group_label,
                      resolved_item_code: cheapest.code,
                    });
                  } else {
                    // No candidate found in this store
                    itemResults.push({
                      item_code: 'group',
                      item_name: item.group_label || item.item_name,
                      quantity: item.quantity,
                      found: false,
                      price: null,
                      total: null,
                      group_label: item.group_label,
                    });
                  }
                  return;
                }

                // ── REGULAR ITEM: direct doc lookup ──
                let doc = await tsGetDoc(collection, `${chainId}-${resolvedSid}-${item.item_code}`);

                // If not found with resolved sid, try other variants
                if (!doc || !(doc.item_price > 0)) {
                  for (const sid of variants) {
                    if (sid === resolvedSid) continue;
                    const altDoc = await tsGetDoc(collection, `${chainId}-${sid}-${item.item_code}`);
                    if (altDoc && altDoc.item_price > 0) {
                      doc = altDoc;
                      break;
                    }
                  }
                }

                if (doc && doc.item_price > 0) {
                  const price = doc.item_price as number;
                  const total = price * item.quantity;
                  totalPrice += total;
                  found++;
                  itemResults.push({
                    item_code: item.item_code,
                    item_name: (doc.item_name as string) || item.item_name,
                    quantity: item.quantity,
                    found: true,
                    price,
                    total,
                  });
                } else {
                  itemResults.push({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    quantity: item.quantity,
                    found: false,
                    price: null,
                    total: null,
                  });
                }
              })
            );

            if (found > 0) {
              storeResults.push({
                store_key: `${chainId}-${resolvedSid}`,
                chain_id: chainId,
                chain_name: store.chain_name,
                store_id: resolvedSid,
                store_name: store.store_name,
                lat: store.lat,
                lng: store.lng,
                distance_km: haversine(lat, lng, store.lat, store.lng),
                products_found: found,
                products_missing: items.length - found,
                total_price: totalPrice,
                items: itemResults,
              });
            }
          })
        );
      })
    );

    // 4. Sort: products_found DESC, then total_price ASC
    storeResults.sort((a, b) => {
      if (b.products_found !== a.products_found) return b.products_found - a.products_found;
      return a.total_price - b.total_price;
    });

    return NextResponse.json({ stores: storeResults });
  } catch (err) {
    console.error('Compare error:', err);
    return NextResponse.json({ error: 'שגיאה בהשוואה' }, { status: 500 });
  }
}
