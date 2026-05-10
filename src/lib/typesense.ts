import TypesenseInstantSearchAdapter from 'typesense-instantsearch-adapter';
import { supabase } from '@/lib/supabase';

// Manufacturer names that are store names or meaningless — hide in UI
const BAD_MANUFACTURER_NAMES = new Set([
  'לא ידוע', 'unknown', 'לא מוגדר', 'n/a', 'na', '-',
  'קריות זול', 'רמי לוי', 'פרש מרקט', 'יוחננוף', 'אושר עד',
  'פוליצר', 'טיב טעם', 'קשת טעמים', 'סטופ מרקט', 'סלח ד',
  'שופרסל', 'מגה', 'ויקטורי', 'חצי חינם', 'יינות ביתן',
]);

export function isValidManufacturerName(name: string | undefined | null): boolean {
  if (!name || !name.trim()) return false;
  const t = name.trim();
  return !BAD_MANUFACTURER_NAMES.has(t) && !BAD_MANUFACTURER_NAMES.has(t.toLowerCase());
}

// Known unit words in Hebrew/common abbreviations
const KNOWN_UNITS = new Set([
  'גרם', 'ג', 'ג\'', 'גרמים',
  'קילוגרם', 'ק"ג', 'קג', 'ק\'\'ג', 'קילו',
  'מיליליטר', 'מ"ל', 'מל', 'מ\'\'ל', 'מיליליטרים',
  'ליטר', 'ליטרים', 'ל\'',
  'יחידה', 'יחידות', 'יח\'', 'יח',
  'מ"מ', 'סמ', 'ס"מ', 'מטר',
  'ml', 'g', 'kg', 'l', 'liter', 'gram',
]);

// Normalize a unit word to a clean display form
function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    'גרמים': 'גרם', 'ג\'': 'גרם', 'ג': 'גרם',
    'קילוגרם': 'ק"ג', 'קג': 'ק"ג', 'קילו': 'ק"ג', 'ק\'\'ג': 'ק"ג',
    'מיליליטרים': 'מ"ל', 'מל': 'מ"ל', 'מ\'\'ל': 'מ"ל', 'מיליליטר': 'מ"ל',
    'ליטרים': 'ליטר', 'ל\'': 'ליטר',
    'יחידות': 'יח\'', 'יח': 'יח\'',
    'ml': 'מ"ל', 'g': 'גרם', 'kg': 'ק"ג', 'l': 'ליטר', 'liter': 'ליטר', 'gram': 'גרם',
  };
  return map[u] || u;
}

/**
 * Format product unit/size info for display.
 *
 * The XML data is messy — fields are often swapped or contain garbage.
 * Strategy:
 *   - `quantity` = total size number (e.g. 750, 1, 500)
 *   - `unit_qty`  = sometimes a unit word (גרם/ליטר/מ"ל), sometimes garbage
 *   - `unit_of_measure` = sometimes "100 גרם" (price-per label), sometimes a unit word
 *
 * We try to extract: a number + a unit word.
 */
export function formatUnitInfo(product: {
  unit_qty?: string | number;
  quantity?: number;
  unit_of_measure?: string;
}): string | null {
  const rawUnitQty = product.unit_qty ? String(product.unit_qty).trim() : '';
  const rawUom = product.unit_of_measure ? String(product.unit_of_measure).trim() : '';
  const totalQty = product.quantity;

  // Determine the best unit word
  let unitWord = '';
  if (KNOWN_UNITS.has(rawUnitQty)) {
    unitWord = normalizeUnit(rawUnitQty);
  } else if (KNOWN_UNITS.has(rawUom)) {
    unitWord = normalizeUnit(rawUom);
  } else {
    // Try to extract unit from "100 גרם" style string in unit_of_measure
    const match = rawUom.match(/^[\d.,]+\s*(.+)$/);
    if (match && KNOWN_UNITS.has(match[1].trim())) {
      unitWord = normalizeUnit(match[1].trim());
    }
  }

  // Format: use totalQty as the size number if available and reasonable
  if (totalQty && totalQty > 0 && unitWord) {
    // Format number: remove trailing .0
    const numStr = totalQty % 1 === 0 ? String(Math.round(totalQty)) : String(totalQty);
    return `${numStr} ${unitWord}`;
  }

  // Fallback: if unit_of_measure looks like a full description (e.g. "750 מ\"ל"), show it
  if (rawUom && /\d/.test(rawUom)) {
    return rawUom;
  }

  // Last resort: show unit word alone if we have one
  if (unitWord) return unitWord;

  return null;
}

/**
 * Calculate price per 100g/100ml for a product.
 *
 * The XML `unit_of_measure` field often contains "100 גרם" or "100 מ\"ל" —
 * this is the Israeli standard price-per-100g label used for comparison.
 * We use `quantity` (total size) + unit to compute price per 100 units.
 *
 * Returns: { pricePer100: number, unit: string } or null if not computable.
 *
 * Example:
 *   product: { min_price: 15, quantity: 750, unit_of_measure: "100 גרם" }
 *   → pricePer100 = 15 / 750 * 100 = 2.00, unit = "גרם"
 *   → display: "₪2.00 ל-100 גרם"
 */
export function calculatePricePer100g(product: {
  min_price: number;
  unit_qty?: string | number;
  quantity?: number;
  unit_of_measure?: string;
}): { pricePer100: number; unit: string } | null {
  const rawUom = product.unit_of_measure ? String(product.unit_of_measure).trim() : '';
  const rawUnitQty = product.unit_qty ? String(product.unit_qty).trim() : '';
  const totalQty = product.quantity;
  const price = product.min_price;

  if (!price || !totalQty || totalQty <= 0) return null;

  // Determine unit word
  let unitWord = '';
  if (KNOWN_UNITS.has(rawUnitQty)) {
    unitWord = normalizeUnit(rawUnitQty);
  } else if (KNOWN_UNITS.has(rawUom)) {
    unitWord = normalizeUnit(rawUom);
  } else {
    const match = rawUom.match(/^[\d.,]+\s*(.+)$/);
    if (match && KNOWN_UNITS.has(match[1].trim())) {
      unitWord = normalizeUnit(match[1].trim());
    }
  }

  // Only compute for weight/volume units (not יחידה)
  const weightVolumeUnits = new Set(['גרם', 'ק"ג', 'מ"ל', 'ליטר']);
  if (!weightVolumeUnits.has(unitWord)) return null;

  // Normalize to grams/ml base
  let totalInBase = totalQty;
  if (unitWord === 'ק"ג') totalInBase = totalQty * 1000; // kg → g
  if (unitWord === 'ליטר') totalInBase = totalQty * 1000; // L → ml
  const baseUnit = (unitWord === 'ק"ג' || unitWord === 'גרם') ? 'גרם' : 'מ"ל';

  const pricePer100 = (price / totalInBase) * 100;
  return { pricePer100, unit: baseUnit };
}

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_PORT = parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '8108');
const TYPESENSE_PROTOCOL = process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'http';
const TYPESENSE_SEARCH_KEY = process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY!;

export const PRODUCTS_INDEX = 'products_index';

export const CHAIN_COLLECTIONS = [
  'products_7290058140886', // רמי לוי
  'products_7290876100000', // פרש מרקט / ויקטורי
  'products_7290803800003', // יוחננוף
  'products_7290103152017', // אושר עד
  'products_7291059100008', // פוליצר
  'products_7290873255550', // טיב טעם
  'products_7290785400000', // קשת טעמים
  'products_7290639000004', // סטופ מרקט
  'products_7290526500006', // סלח ד
];

export const CHAIN_NAMES: Record<string, string> = {
  '7290058140886': 'רמי לוי',
  '7290876100000': 'פרש מרקט',
  '7290803800003': 'יוחננוף',
  '7290103152017': 'אושר עד',
  '7291059100008': 'פוליצר',
  '7290873255550': 'טיב טעם',
  '7290785400000': 'קשת טעמים',
  '7290639000004': 'סטופ מרקט',
  '7290526500006': 'סלח ד',
};

export const typesenseConfig = {
  nodes: [
    {
      host: TYPESENSE_HOST,
      port: TYPESENSE_PORT,
      protocol: TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: TYPESENSE_SEARCH_KEY,
  connectionTimeoutSeconds: 5,
};

export function createSearchAdapter(collectionName: string) {
  return new TypesenseInstantSearchAdapter({
    server: typesenseConfig,
    additionalSearchParameters: {
      query_by: 'item_name,manufacturer_name,manufacturer_item_id',
      sort_by: 'item_price:asc',
      num_typos: 2,
    },
    collectionSpecificSearchParameters: {
      [collectionName]: {
        query_by: 'item_name,manufacturer_name,manufacturer_item_id',
      },
    },
  });
}

// חיפוש ישיר ב-Typesense API (ללא InstantSearch)
export async function searchProducts(query: string, options?: {
  chainId?: string;
  storeId?: string;
  page?: number;
  perPage?: number;
}) {
  const { chainId, storeId, page = 1, perPage = 20 } = options || {};

  const collections = chainId
    ? [`products_${chainId}`]
    : CHAIN_COLLECTIONS;

  const filterBy = storeId ? `store_id:=${storeId}` : undefined;

  const results = await Promise.all(
    collections.map(async (collection) => {
      const params = new URLSearchParams({
        q: query,
        query_by: 'item_name,manufacturer_name,manufacturer_item_id',
        page: page.toString(),
        per_page: perPage.toString(),
        num_typos: '2',
        ...(filterBy && { filter_by: filterBy }),
      });

      const res = await fetch(
        `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${collection}/documents/search?${params}`,
        {
          headers: {
            'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY,
          },
        }
      );

      if (!res.ok) return null;
      const data = await res.json();
      return { collection, ...data };
    })
  );

  return results.filter(Boolean);
}

// ── Fetch all group item_codes from Supabase (for client-side search boosting) ──
// Returns a Set of item_codes that belong to any product group
export async function fetchAllGroupItemCodes(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('product_group_items')
      .select('item_code');
    if (error || !data) return new Set();
    return new Set(data.map((r: { item_code: string }) => r.item_code));
  } catch {
    return new Set();
  }
}

// חיפוש ב-products_index (מוצר אחד לכל מק"ט)
// Uses /api/search proxy to avoid mixed-content (HTTPS page → HTTP Typesense)
// If groupItemCodes is provided, group items are sorted to the top of results.
export async function searchProductsIndex(query: string, options?: {
  page?: number;
  perPage?: number;
  onlyPromos?: boolean;
  groupItemCodes?: Set<string>;
}) {
  const { page = 1, perPage = 24, onlyPromos = false, groupItemCodes } = options || {};

  const params = new URLSearchParams({
    collection: PRODUCTS_INDEX,
    q: query,
    query_by: 'item_name,manufacturer_name,manufacturer_item_id',
    page: page.toString(),
    per_page: perPage.toString(),
    num_typos: '2',
    sort_by: 'chain_count:desc,min_price:asc',
    ...(onlyPromos && { filter_by: 'has_promotion:=true' }),
  });

  const res = await fetch(`/api/search?${params}`);

  if (!res.ok) return { hits: [], found: 0 };
  const data = await res.json();
  let hits = (data.hits || []).map((h: { document: IndexProduct }) => h.document as IndexProduct);

  // Client-side re-sort: group items first, then rest sorted by min_price asc
  if (groupItemCodes && groupItemCodes.size > 0) {
    const inGroup = hits.filter((h: IndexProduct) => groupItemCodes.has(h.item_code));
    const notInGroup = hits
      .filter((h: IndexProduct) => !groupItemCodes.has(h.item_code))
      .sort((a: IndexProduct, b: IndexProduct) => (a.min_price ?? 0) - (b.min_price ?? 0));
    hits = [...inGroup, ...notInGroup];
  } else {
    // No groups — sort by min_price asc
    hits = hits.sort((a: IndexProduct, b: IndexProduct) => (a.min_price ?? 0) - (b.min_price ?? 0));
  }

  return {
    hits,
    found: data.found || 0,
  };
}

/**
 * Look up a single product in products_index by its exact item_code (barcode).
 * Uses filter_by=item_code:=<code> so it works even if the barcode isn't in item_name.
 * Returns the product or null if not found.
 */
export async function getProductByItemCode(itemCode: string): Promise<IndexProduct | null> {
  const params = new URLSearchParams({
    collection: PRODUCTS_INDEX,
    q: '*',
    query_by: 'item_name',
    filter_by: `item_code:=${itemCode}`,
    per_page: '1',
  });

  try {
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data.hits || [];
    if (hits.length === 0) return null;
    return hits[0].document as IndexProduct;
  } catch {
    return null;
  }
}

export type IndexProduct = {
  id: string;
  item_code: string;
  item_name: string;
  manufacturer_name?: string;
  manufacturer_item_id?: string;
  unit_qty?: string;
  quantity?: number;
  unit_of_measure?: string;
  b_is_weighted?: boolean;
  min_price: number;
  max_price?: number;
  chain_count: number;
  has_promotion?: boolean;
  promo_price?: number;
  promo_description?: string;
};

// Module-level cache for store IDs per collection (persists across calls in same session)
const _storeIdCache: Record<string, string[]> = {};

// חיפוש מוצר ספציפי לפי barcode בכל הרשתות
// Uses /api/search proxy to avoid mixed-content (HTTPS page → HTTP Typesense)
export async function getProductPrices(itemCode: string) {
  const results = await Promise.all(
    CHAIN_COLLECTIONS.map(async (collection) => {
      const chainId = collection.replace('products_', '');

      // Get store IDs via proxy (module-level cache)
      if (!_storeIdCache[collection]) {
        try {
          const storeParams = new URLSearchParams({
            collection,
            q: '*',
            query_by: 'item_name',
            facet_by: 'store_id',
            per_page: '1',
            max_facet_values: '200',
          });
          const storeRes = await fetch(`/api/search?${storeParams}`);
          if (storeRes.ok) {
            const storeData = await storeRes.json();
            const facet = storeData.facet_counts?.find((f: { field_name: string }) => f.field_name === 'store_id');
            _storeIdCache[collection] = (facet?.counts || []).map((c: { value: string }) => c.value);
          }
        } catch { /* skip */ }
      }

      const storeIds = _storeIdCache[collection] || [];
      if (storeIds.length === 0) return null;

      // Try stores in parallel batches of 10, stop as soon as we find the product
      const BATCH = 10;
      const allDocs: Record<string, unknown>[] = [];

      for (let i = 0; i < Math.min(storeIds.length, 30); i += BATCH) {
        const batch = storeIds.slice(i, i + BATCH);
        const batchDocs = await Promise.all(
          batch.map(async (sid) => {
            const docId = `${chainId}-${sid}-${itemCode}`;
            try {
              const params = new URLSearchParams({ collection, doc_id: docId });
              const res = await fetch(`/api/search?${params}`);
              if (res.ok) {
                const doc = await res.json();
                if (doc.item_name && doc.item_price > 0) return { ...doc, store_id: sid };
              }
            } catch { /* skip */ }
            return null;
          })
        );
        const found = batchDocs.filter(Boolean) as Record<string, unknown>[];
        allDocs.push(...found);
        if (allDocs.length > 0 && i === 0) break;
      }

      if (allDocs.length === 0) return null;
      return {
        chainId,
        chainName: CHAIN_NAMES[chainId] || chainId,
        hits: allDocs.map(doc => ({ document: doc })),
      };
    })
  );

  return results.filter((r) => r && r.hits.length > 0);
}
