import { NextRequest, NextResponse } from 'next/server';

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108';
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
const TYPESENSE_SEARCH_KEY = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY!;

const TS_BASE = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}`;
const TS_HEADERS = { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY };

// How many days old a fresh product's price can be before it's excluded
const FRESH_MAX_AGE_DAYS = 7;

// Fuel cost: 8 NIS per 15 km = 0.5333 NIS/km
// Used to adjust effective_total so closer stores win on tie-breaking
const FUEL_COST_PER_KM = 8 / 15;

async function tsSearch(collection: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${TS_BASE}/collections/${collection}/documents/search?${qs}`, {
    headers: TS_HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Batch fetch prices for multiple doc IDs using Typesense /multi_search (POST).
 * Splits into chunks of CHUNK_SIZE to stay well under any payload limits.
 * Returns a map of docId → DocData
 */
const BATCH_CHUNK_SIZE = 50; // IDs per sub-query; keeps filter_by well under 4000 chars

type DocData = {
  item_price: number;
  item_name: string;
  unit_price?: number;             // מחיר ל-100ג׳/מ״ל
  promo_price?: number;            // מחיר מבצע (discounted_price)
  promo_min_qty?: number;          // כמות מינימום למבצע
  reward_type?: number;            // 1/3=מחיר קבוע, 10=עסקת כמות (6=מתנה — מדולג)
  b_is_weighted?: boolean;         // מוצר שקיל (נמכר לפי משקל)
  promotion_description?: string;  // תיאור המבצע (לתצוגה)
};

async function tsBatchGetDocs(
  collection: string,
  docIds: string[]
): Promise<Map<string, DocData>> {
  if (docIds.length === 0) return new Map();

  // Split into chunks
  const chunks: string[][] = [];
  for (let i = 0; i < docIds.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(docIds.slice(i, i + BATCH_CHUNK_SIZE));
  }

  // Build multi_search payload — one search per chunk
  const searches = chunks.map(chunk => ({
    collection,
    q: '*',
    query_by: 'item_name',
    filter_by: `id:[${chunk.map(id => `\`${id}\``).join(',')}]`,
    per_page: chunk.length,
    include_fields: 'id,item_price,item_name,unit_price,promo_price,promo_min_qty,reward_type,b_is_weighted,promotion_description',
  }));

  const res = await fetch(`${TS_BASE}/multi_search`, {
    method: 'POST',
    headers: { ...TS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ searches }),
    cache: 'no-store',
  });

  const result = new Map<string, DocData>();
  if (!res.ok) return result;

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const searchResult of (data.results ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const hit of (searchResult.hits ?? []) as any[]) {
      const doc = hit.document;
      if (doc?.id && doc.item_price > 0) {
        result.set(doc.id, {
          item_price:    doc.item_price,
          item_name:     doc.item_name,
          unit_price:    doc.unit_price    ?? undefined,
          promo_price:   doc.promo_price   ?? undefined,
          promo_min_qty: doc.promo_min_qty ?? undefined,
          reward_type:   doc.reward_type   ?? undefined,
          b_is_weighted: doc.b_is_weighted ?? undefined,
        });
      }
    }
  }
  return result;
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

/**
 * Calculate the effective (promo-adjusted) price for an item.
 * RewardType 1, 3 → fixed discounted price (apply when qty >= min_qty)
 * RewardType 10   → quantity deal (apply when qty >= min_qty)
 * RewardType 6    → gift item — skipped in pipeline, never reaches here
 * Returns itemPrice unchanged if promo doesn't apply or is not cheaper.
 */
function calcEffectivePrice(
  itemPrice: number,
  promoPrice?: number,
  promoMinQty?: number,
  rewardType?: number,
  quantity = 1,
): number {
  if (!promoPrice || promoPrice <= 0 || promoPrice >= itemPrice) return itemPrice;
  const minQty = promoMinQty ?? 1;
  if (rewardType === 1 || rewardType === 3) {
    return quantity >= minQty ? promoPrice : itemPrice;
  }
  if (rewardType === 10 && quantity >= minQty) {
    return promoPrice;
  }
  return itemPrice;
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
  effective_total: number;      // total_price with promos applied
  fuel_adjusted_total: number;  // effective_total + fuel cost to reach store
  items: ItemResult[];
};

export type ItemResult = {
  item_code: string;
  item_name: string;
  quantity: number;
  found: boolean;
  price: number | null;
  total: number | null;
  unit_price?: number | null;           // מחיר ל-100ג׳/מ״ל
  effective_price?: number | null;      // מחיר אחרי מבצע (אם קיים)
  promotion_description?: string | null; // תיאור המבצע (לתצוגה)
  // Group item fields
  group_label?: string;       // Display name of the group (e.g. "שמן קנולה/חמניות")
  resolved_item_code?: string; // Actual barcode that was found (same as item_code when found)
  is_fresh_product?: boolean;  // True for fresh meat/poultry groups
  image_item_code?: string | null; // Item code to use for group image display
};

// Input item type (supports both regular and group items)
type InputItem = {
  item_code: string;
  item_name: string;
  quantity: number;
  candidate_codes?: string[]; // For group items: all barcodes in the group
  group_label?: string;       // For group items: display name of the group
  is_fresh_product?: boolean; // For fresh groups: use dynamic search instead of fixed codes
  image_item_code?: string | null; // For group items: item code to use for image display
};

/**
 * Find fresh product candidates from products_index (merged index) that were
 * updated within FRESH_MAX_AGE_DAYS. Returns item_codes matching the group label.
 * Falls back to all weighted matches if none are recent enough.
 */
async function getFreshCandidateCodes(groupLabel: string): Promise<string[]> {
  const cutoffTs = Math.floor(Date.now() / 1000) - FRESH_MAX_AGE_DAYS * 86400;

  // Try 1: weighted + recently updated (requires rebuilt index with last_updated + b_is_weighted)
  try {
    const data = await tsSearch('products_index', {
      q: groupLabel,
      query_by: 'item_name',
      filter_by: `b_is_weighted:=true && last_updated:>=${cutoffTs}`,
      sort_by: '_text_match:desc,chain_count:desc',
      per_page: '20',
    });
    if (data?.hits?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.hits.map((h: any) => h.document.item_code as string);
    }
  } catch { /* field not in schema yet */ }

  // Try 2: weighted only (no last_updated filter)
  try {
    const fallback = await tsSearch('products_index', {
      q: groupLabel,
      query_by: 'item_name',
      filter_by: 'b_is_weighted:=true',
      sort_by: '_text_match:desc,chain_count:desc',
      per_page: '20',
    });
    if (fallback?.hits?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return fallback.hits.map((h: any) => h.document.item_code as string);
    }
  } catch { /* field not in schema yet */ }

  // Try 3: plain text search, no filter (works with any schema)
  try {
    const plain = await tsSearch('products_index', {
      q: groupLabel,
      query_by: 'item_name',
      sort_by: '_text_match:desc,chain_count:desc',
      per_page: '20',
    });
    if (plain?.hits?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return plain.hits.map((h: any) => h.document.item_code as string);
    }
  } catch { /* search failed entirely */ }

  return [];
}

/**
 * POST /api/compare
 * Body: { lat, lng, radius_km, items: [{item_code, item_name, quantity, candidate_codes?, group_label?, is_fresh_product?}] }
 * Returns: { stores, most_cost_effective_key }
 *   stores: sorted by products_found DESC, total_price ASC
 *   most_cost_effective_key: store_key of the store with lowest fuel-adjusted effective total
 *
 * PERFORMANCE: Uses batch Typesense queries (one per item per chain) instead of
 * individual doc fetches, reducing N*M requests to N+M requests.
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

    // Pre-fetch fresh candidate codes once per fresh item (from products_index)
    const freshCandidateMap = new Map<string, string[]>(); // group_label → item_codes
    await Promise.all(
      items
        .filter(i => i.is_fresh_product)
        .map(async (item) => {
          const label = item.group_label || item.item_name;
          if (!freshCandidateMap.has(label)) {
            const codes = await getFreshCandidateCodes(label);
            freshCandidateMap.set(label, codes);
          }
        })
    );

    // 3. For each chain, batch-fetch all prices in as few Typesense calls as possible
    //    Strategy: for each item, build all possible doc IDs for all stores in this chain,
    //    then fetch them all in one query. This reduces requests from O(stores*items) to O(items*chains).

    // storeResults accumulates results per store
    // Use a map: storeKey → StoreResult
    const storeResultMap = new Map<string, StoreResult>();

    // Initialize store entries
    for (const store of nearbyStores) {
      const variants = storeIdVariants(store.store_id);
      const storeKey = `${store.chain_id}-${variants[0]}`;
      if (!storeResultMap.has(storeKey)) {
        storeResultMap.set(storeKey, {
          store_key: storeKey,
          chain_id: store.chain_id,
          chain_name: store.chain_name,
          store_id: variants[0],
          store_name: store.store_name,
          lat: store.lat,
          lng: store.lng,
          distance_km: haversine(lat, lng, store.lat, store.lng),
          products_found: 0,
          products_missing: 0,
          total_price: 0,
          effective_total: 0,
          fuel_adjusted_total: 0,
          items: [],
        });
      }
    }

    await Promise.all(
      Object.entries(chainStoreMap).map(async ([chainId, stores]) => {
        const collection = `products_${chainId}`;

        // Build a map: storeId → store info (using all variants)
        // We'll track which variant key maps to which store
        const storeVariantMap = new Map<string, typeof stores[0]>(); // variantKey → store
        for (const store of stores) {
          for (const sid of storeIdVariants(store.store_id)) {
            storeVariantMap.set(sid, store);
          }
        }
        const allSids = Array.from(storeVariantMap.keys());

        // For each item, batch-fetch prices across all stores in this chain
        await Promise.all(
          items.map(async (item) => {
            // Determine which item codes to look up
            let codesToCheck: string[];
            if (item.is_fresh_product) {
              const label = item.group_label || item.item_name;
              codesToCheck = freshCandidateMap.get(label) ?? [];
            } else if (item.candidate_codes?.length) {
              codesToCheck = item.candidate_codes;
            } else {
              codesToCheck = [item.item_code];
            }

            if (codesToCheck.length === 0) {
              // Mark all stores as missing this item
              for (const store of stores) {
                const storeKey = `${chainId}-${storeIdVariants(store.store_id)[0]}`;
                const sr = storeResultMap.get(storeKey);
                if (sr) {
                  sr.products_missing++;
                  sr.items.push({
                    item_code: item.item_code,
                    item_name: item.group_label || item.item_name,
                    quantity: item.quantity,
                    found: false,
                    price: null,
                    total: null,
                    unit_price: null,
                    effective_price: null,
                    group_label: item.group_label,
                    is_fresh_product: item.is_fresh_product,
                    image_item_code: item.image_item_code,
                  });
                }
              }
              return;
            }

            // Build all doc IDs: chainId-storeId-itemCode for all sids × all codes
            const docIds: string[] = [];
            for (const sid of allSids) {
              for (const code of codesToCheck) {
                docIds.push(`${chainId}-${sid}-${code}`);
              }
            }

            // Batch fetch all at once (one Typesense query per item per chain)
            const priceMap = await tsBatchGetDocs(collection, docIds);

            // For each store, find the best price among all codes and variants.
            // For weight-based items (b_is_weighted=true): compare by unit_price (price/100g).
            // For regular items: compare by item_price.
            for (const store of stores) {
              const variants = storeIdVariants(store.store_id);
              const primaryVariant = variants[0];
              const storeKey = `${chainId}-${primaryVariant}`;
              const sr = storeResultMap.get(storeKey);
              if (!sr) continue;

              // Find best match across all codes and all sid variants
              let bestPrice: number | null = null;
              let bestCode: string | null = null;
              let bestName: string | null = null;
              let bestUnitPrice: number | null = null;
              let bestEffectivePrice: number | null = null;
              let bestPromoDesc: string | null = null;
              let bestCompareValue: number | null = null; // unit_price or item_price

              for (const sid of variants) {
                for (const code of codesToCheck) {
                  const docId = `${chainId}-${sid}-${code}`;
                  const doc = priceMap.get(docId);
                  if (!doc || doc.item_price <= 0) continue;

                  // For weight-based items: compare by unit_price if available
                  const isWeightBased = doc.b_is_weighted === true;
                  const compareValue = (isWeightBased && doc.unit_price && doc.unit_price > 0)
                    ? doc.unit_price
                    : doc.item_price;

                  if (bestCompareValue === null || compareValue < bestCompareValue) {
                    bestCompareValue = compareValue;
                    bestPrice = doc.item_price;
                    bestCode = code;
                    bestName = doc.item_name;
                    bestUnitPrice = doc.unit_price ?? null;
                    bestPromoDesc = doc.promotion_description ?? null;
                    bestEffectivePrice = calcEffectivePrice(
                      doc.item_price,
                      doc.promo_price,
                      doc.promo_min_qty,
                      doc.reward_type,
                      item.quantity,
                    );
                  }
                }
              }

              if (bestPrice !== null && bestCode !== null) {
                const total = bestPrice * item.quantity;
                const effectiveTotal = (bestEffectivePrice ?? bestPrice) * item.quantity;
                sr.total_price += total;
                sr.effective_total += effectiveTotal;
                sr.products_found++;
                sr.items.push({
                  item_code: bestCode,
                  item_name: bestName || item.group_label || item.item_name,
                  quantity: item.quantity,
                  found: true,
                  price: bestPrice,
                  total,
                  unit_price: bestUnitPrice,
                  effective_price: bestEffectivePrice,
                  promotion_description: bestPromoDesc,
                  group_label: item.group_label,
                  resolved_item_code: bestCode,
                  is_fresh_product: item.is_fresh_product,
                  image_item_code: item.image_item_code,
                });
              } else {
                sr.products_missing++;
                sr.items.push({
                  item_code: item.is_fresh_product ? 'group' : (item.candidate_codes?.length ? 'group' : item.item_code),
                  item_name: item.group_label || item.item_name,
                  quantity: item.quantity,
                  found: false,
                  price: null,
                  total: null,
                  unit_price: null,
                  effective_price: null,
                  promotion_description: null,
                  group_label: item.group_label,
                  is_fresh_product: item.is_fresh_product,
                  image_item_code: item.image_item_code,
                });
              }
            }
          })
        );
      })
    );

    // 4. Compute fuel_adjusted_total for each store
    Array.from(storeResultMap.values()).forEach(sr => {
      sr.fuel_adjusted_total = sr.effective_total + sr.distance_km * FUEL_COST_PER_KM;
    });

    // 5. Filter stores that found at least one item, sort: products_found DESC, total_price ASC
    const storeResults = Array.from(storeResultMap.values())
      .filter(s => s.products_found > 0)
      .sort((a, b) => {
        if (b.products_found !== a.products_found) return b.products_found - a.products_found;
        return a.total_price - b.total_price;
      });

    // 6. Find most cost-effective store:
    //    Among stores with maximum coverage, pick the one with lowest fuel_adjusted_total.
    //    This accounts for both promo prices and travel cost.
    let mostCostEffectiveKey: string | null = null;
    if (storeResults.length > 0) {
      const maxFound = storeResults[0].products_found; // already sorted, first has max
      const topCoverage = storeResults.filter(s => s.products_found === maxFound);
      const best = topCoverage.reduce((a, b) =>
        a.fuel_adjusted_total <= b.fuel_adjusted_total ? a : b
      );
      mostCostEffectiveKey = best.store_key;
    }

    return NextResponse.json({
      stores: storeResults,
      most_cost_effective_key: mostCostEffectiveKey,
    });
  } catch (err) {
    console.error('Compare error:', err);
    return NextResponse.json({ error: 'שגיאה בהשוואה' }, { status: 500 });
  }
}
