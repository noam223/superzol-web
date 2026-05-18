'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShoppingCart, MapPin, Navigation, ChevronDown, ChevronUp,
  RefreshCw, X, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PRODUCTS_INDEX } from '@/lib/typesense';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { getUserLocation, saveUserLocation } from '@/lib/location';
import { getChainLogoUrl } from '@/lib/chainLogos';

// ─── Types ────────────────────────────────────────────────────────────────────

type ListItem = {
  item_code: string;
  item_name: string;
  quantity: number;
  group_id?: string | null;
  group_label?: string;
  candidate_codes?: string[];
  is_fresh_product?: boolean;
  image_item_code?: string | null;
};

type ItemResult = {
  item_code: string;
  item_name: string;
  quantity: number;
  found: boolean;
  price: number | null;
  total: number | null;
  unit_price?: number | null;           // מחיר ל-100ג׳/מ״ל
  effective_price?: number | null;      // מחיר אחרי מבצע
  promotion_description?: string | null; // תיאור המבצע
  promo_min_qty?: number | null;        // כמות מינימום לממש מבצע
  group_label?: string;
  resolved_item_code?: string;
  is_fresh_product?: boolean;
  image_item_code?: string | null;
};

type StoreResult = {
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
  effective_total: number;      // total with promos applied
  fuel_adjusted_total: number;  // effective_total + fuel cost
  items: ItemResult[];
};

type IndexProduct = {
  item_code: string;
  item_name: string;
  min_price: number;
  chain_count: number;
};

type Location = { lat: number; lng: number; label: string };

type PromoSuggestion = {
  item_code: string;       // 'group' for group items
  group_label?: string;    // for group items: used as unique key instead of item_code
  item_name: string;
  current_qty: number;
  suggested_qty: number;
  promotion_description: string;
  store_name: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProductImg({ itemCode, name, size = 40 }: { itemCode: string; name: string; size?: number }) {
  const [src, setSrc] = useState(getProductImageUrl(itemCode));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => { if (src === getProductImageUrl(itemCode)) setSrc(getProductImageFallback(itemCode)); }}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, background: 'white', flexShrink: 0 }}
    />
  );
}

/** Remove chain name prefix from store name if it appears at the start (case-insensitive, trimmed).
 *  e.g. chain_name="רמי לוי", store_name="רמי לוי נתניה" → "נתניה"
 *  If the store name equals the chain name exactly, return it as-is.
 */
function stripChainPrefix(storeName: string | undefined | null, chainName: string | undefined | null): string {
  const s = (storeName ?? '').trim();
  const c = (chainName ?? '').trim();
  if (!c) return s;
  if (s.startsWith(c)) {
    const rest = s.slice(c.length).trim();
    return rest || s; // don't return empty string
  }
  return s;
}

async function fetchProductFromIndex(itemCode: string): Promise<IndexProduct | null> {
  try {
    const res = await fetch(`/api/search?collection=${PRODUCTS_INDEX}&doc_id=${itemCode}`);
    if (res.ok) return await res.json();
  } catch { /* skip */ }
  return null;
}

async function checkItemInStore(chainId: string, storeId: string, itemCode: string): Promise<number | null> {
  // Try multiple store_id variants (padded/unpadded)
  const plain = String(parseInt(storeId, 10));
  const padded3 = plain.padStart(3, '0');
  const variants = Array.from(new Set([storeId, padded3, plain]));
  for (const v of variants) {
    try {
      const res = await fetch(`/api/search?collection=products_${chainId}&doc_id=${chainId}-${v}-${itemCode}`);
      if (!res.ok) continue;
      const doc = await res.json();
      if (doc && !doc.error && (doc.item_price ?? 0) > 0) return doc.item_price as number;
    } catch { /* skip */ }
  }
  return null;
}

async function fetchCandidates(q: string, excludeCode: string): Promise<IndexProduct[]> {
  const params = new URLSearchParams({
    collection: PRODUCTS_INDEX,
    q,
    query_by: 'item_name,manufacturer_name',
    query_by_weights: '4,1',
    per_page: '50',
    num_typos: '1',
    min_len_1typo: '4',
    min_len_2typo: '7',
    prefix: 'true,false',
    prioritize_exact_prefix_match: 'true',
    sort_by: '_text_match:desc,chain_count:desc,min_price:asc',
  });
  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.hits || [])
    .map((h: { document: IndexProduct }) => h.document)
    .filter((p: IndexProduct) => p.item_code !== excludeCode);
}

async function searchSubstitutes(
  q: string,
  excludeCode: string,
  chainId: string,
  storeId: string
): Promise<(IndexProduct & { store_price: number })[]> {
  try {
    const words = q.trim().split(/\s+/);
    const firstWord = words[0];
    const twoWords = words.slice(0, 2).join(' ');

    const [primary, secondary] = await Promise.all([
      fetchCandidates(twoWords, excludeCode),
      firstWord !== twoWords ? fetchCandidates(firstWord, excludeCode) : Promise.resolve([]),
    ]);

    const primaryCodes = new Set(primary.map(p => p.item_code));
    const merged = [...primary, ...secondary.filter(p => !primaryCodes.has(p.item_code))];

    const checked = await Promise.all(
      merged.map(async (p) => {
        const price = await checkItemInStore(chainId, storeId, p.item_code);
        return price !== null ? { ...p, store_price: price } : null;
      })
    );
    return checked.filter(Boolean) as (IndexProduct & { store_price: number })[];
  } catch { return []; }
}

// ─── SubstituteSheet ──────────────────────────────────────────────────────────

// ─── ProductDetailSheet ───────────────────────────────────────────────────────

type PriceHistoryRow = { date: string; price: number; chain_id: string };

function ProductDetailSheet({
  item, onClose,
}: {
  item: ItemResult;
  onClose: () => void;
}) {
  const itemCode = item.resolved_item_code && item.resolved_item_code !== 'group'
    ? item.resolved_item_code
    : item.item_code;
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/price-history?item_code=${encodeURIComponent(itemCode)}&days=60`)
      .then(r => r.ok ? r.json() : { history: [] })
      .then(d => { setHistory(d.history || []); setHistLoading(false); })
      .catch(() => setHistLoading(false));
  }, [itemCode]);

  // Simple inline sparkline — last 14 days, single chain aggregated
  const chartData = (() => {
    if (history.length === 0) return [];
    const byDate: Record<string, number[]> = {};
    history.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r.price);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, prices]) => ({ date, price: Math.min(...prices) }));
  })();

  const minP = chartData.length ? Math.min(...chartData.map(d => d.price)) : 0;
  const maxP = chartData.length ? Math.max(...chartData.map(d => d.price)) : 1;
  const W = 280, H = 70, PAD = 8;
  const xStep = chartData.length > 1 ? (W - PAD * 2) / (chartData.length - 1) : 0;
  const yScale = (p: number) => maxP === minP ? H / 2 : PAD + ((maxP - p) / (maxP - minP)) * (H - PAD * 2);
  const points = chartData.map((d, i) => `${PAD + i * xStep},${yScale(d.price)}`).join(' ');

  const displayPrice = item.effective_price != null && item.effective_price < item.price!
    ? item.effective_price
    : item.price;

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl"
        style={{ background: '#F5EDE4', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#C4B8AC' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <button onClick={onClose} style={{ color: '#8a7f75' }}><X size={20} /></button>
          <Link
            href={`/product/${itemCode}`}
            className="text-xs px-3 py-1.5 rounded-xl font-medium"
            style={{ background: 'rgba(79,72,63,0.1)', color: '#4F483F' }}
            onClick={onClose}
          >
            דף מוצר מלא ›
          </Link>
        </div>

        <div className="overflow-y-auto px-5 pb-10 flex flex-col gap-4" style={{ overscrollBehavior: 'contain' }}>
          {/* Product image + name + price */}
          <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(182,171,156,0.3)' }}>
            <ProductImg itemCode={itemCode} name={item.item_name} size={72} />
            <div className="flex-1 min-w-0">
              {item.group_label && (
                <p className="text-xs font-bold mb-0.5" style={{ color: item.is_fresh_product ? '#b05a00' : '#BF2C2C' }}>
                  {item.is_fresh_product ? '🥩' : '📦'} {item.group_label}
                </p>
              )}
              <p className="text-sm font-bold leading-snug" style={{ color: '#4F483F' }}>{item.item_name}</p>
              <p className="text-xs mt-1" style={{ color: '#8a7f75' }}>×{item.quantity}</p>
              <div className="mt-2">
                {item.effective_price != null && item.effective_price < item.price! ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: '#2d7a2d' }}>₪{(item.effective_price * item.quantity).toFixed(2)}</p>
                    <p className="text-xs line-through" style={{ color: '#B6AB9C' }}>₪{item.total!.toFixed(2)}</p>
                  </>
                ) : (
                  <p className="text-lg font-bold" style={{ color: '#2d7a2d' }}>₪{item.total!.toFixed(2)}</p>
                )}
                {displayPrice != null && (
                  <p className="text-xs" style={{ color: '#8a7f75' }}>₪{displayPrice.toFixed(2)} ליח׳</p>
                )}
                {item.unit_price != null && item.unit_price > 0 && (
                  <p className="text-xs" style={{ color: '#8a7f75' }}>₪{item.unit_price.toFixed(2)}/100ג׳</p>
                )}
              </div>
              {item.promotion_description && (
                <p className="text-xs font-medium mt-1" style={{ color: '#c47a00' }}>🏷️ {item.promotion_description}</p>
              )}
            </div>
          </div>

          {/* Price history sparkline */}
          <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(182,171,156,0.3)' }}>
            <p className="text-sm font-bold mb-3" style={{ color: '#4F483F' }}>היסטוריית מחירים (60 יום)</p>
            {histLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
              </div>
            ) : chartData.length < 2 ? (
              <p className="text-xs text-center py-3" style={{ color: '#8a7f75' }}>אין מספיק נתונים</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#BF2C2C"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {chartData.map((d, i) => (
                    <circle key={i} cx={PAD + i * xStep} cy={yScale(d.price)} r={3} fill="#BF2C2C" />
                  ))}
                  <text x={PAD} y={H - 2} fontSize={9} fill="#8a7f75">{chartData[0]?.date?.slice(5)}</text>
                  <text x={W - PAD} y={H - 2} fontSize={9} fill="#8a7f75" textAnchor="end">{chartData[chartData.length - 1]?.date?.slice(5)}</text>
                  <text x={PAD} y={yScale(minP) - 4} fontSize={9} fill="#2d7a2d">₪{minP.toFixed(2)}</text>
                  <text x={PAD} y={yScale(maxP) + 12} fontSize={9} fill="#BF2C2C">₪{maxP.toFixed(2)}</text>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── SubstituteSheet ──────────────────────────────────────────────────────────

function SubstituteSheet({
  item, chainId, storeId, onClose, onReplace,
}: {
  item: ItemResult;
  chainId: string;
  storeId: string;
  onClose: () => void;
  onReplace: (oldCode: string, newItem: ListItem, storePrice: number) => Promise<void>;
}) {
  const [results, setResults] = useState<(IndexProduct & { store_price: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const displayName = item.group_label || item.item_name;
  const firstWord = displayName.split(' ')[0];
  const twoWords = displayName.split(' ').slice(0, 2).join(' ');
  const [query, setQuery] = useState(firstWord);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    setResults(await searchSubstitutes(q, item.item_code, chainId, storeId));
    setLoading(false);
  }, [item.item_code, chainId, storeId]);

  useEffect(() => { doSearch(twoWords); }, [twoWords, doSearch]);

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl"
        style={{ background: '#F5EDE4', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#C4B8AC' }} />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <h3 className="font-bold text-base" style={{ color: '#4F483F' }}>
            תחליפים עבור: <span className="font-normal text-sm">{displayName}</span>
          </h3>
          <button onClick={onClose} style={{ color: '#8a7f75' }}><X size={20} /></button>
        </div>
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(182,171,156,0.4)' }}>
            <Search size={16} style={{ color: '#8a7f75', flexShrink: 0 }} />
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: '#4F483F', direction: 'rtl' }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch(query)}
              placeholder="חפש תחליף..."
            />
            <button onClick={() => doSearch(query)} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: '#BF2C2C', color: 'white' }}>
              חפש
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-24 flex flex-col gap-2" style={{ overscrollBehavior: 'contain' }}>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
            </div>
          ) : results.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#8a7f75' }}>לא נמצאו תחליפים</p>
          ) : results.map(p => (
            <div key={p.item_code} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(182,171,156,0.3)' }}>
              <ProductImg itemCode={p.item_code} name={p.item_name} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight" style={{ color: '#4F483F' }}>{p.item_name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#2d7a2d', fontWeight: 600 }}>₪{p.store_price.toFixed(2)} בחנות זו</p>
              </div>
              <button
                onClick={async () => { await onReplace(item.item_code, { item_code: p.item_code, item_name: p.item_name, quantity: item.quantity }, p.store_price); onClose(); }}
                className="text-xs px-3 py-1.5 rounded-xl font-medium shrink-0"
                style={{ background: '#2d7a2d', color: 'white' }}
              >
                החלף
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── MostCostEffectiveCard ────────────────────────────────────────────────────

function MostCostEffectiveCard({
  store, totalItems, cheapestTotal,
}: {
  store: StoreResult;
  totalItems: number;
  cheapestTotal: number; // total_price of rank-#1 store (for savings display)
}) {
  const [open, setOpen] = useState(false);
  const coveragePct = Math.round((store.products_found / totalItems) * 100);
  const hasPromos = store.effective_total < store.total_price;
  const displayTotal = hasPromos ? store.effective_total : store.total_price;
  const fuelCost = store.distance_km * 2 * (8 / 15); // round-trip, 8 NIS per 15 km
  const grandTotal = displayTotal + fuelCost;
  const savings = cheapestTotal - displayTotal;

  return (
    <div
      className="rounded-3xl overflow-hidden mb-1"
      style={{
        background: 'linear-gradient(135deg, rgba(255,248,210,0.97) 0%, rgba(255,235,150,0.92) 100%)',
        border: '2px solid rgba(220,170,0,0.55)',
        boxShadow: '0 0 22px 2px rgba(220,170,0,0.18)',
      }}
    >
      {/* Clickable header row — toggles accordion */}
      <button className="w-full flex items-center gap-3 px-4 pt-3 pb-2 text-right" onClick={() => setOpen(o => !o)}>
        {/* Badge + logo stacked */}
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <span className="text-lg">⭐</span>
          {getChainLogoUrl(store.chain_name, store.chain_id) ? (
            <div style={{ width: 44, height: 28, borderRadius: 7, overflow: 'hidden', background: '#fff', border: '1px solid rgba(182,171,156,0.25)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getChainLogoUrl(store.chain_name, store.chain_id)!} alt={store.chain_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <span style={{ fontSize: 9, color: '#8a7f75', textAlign: 'center', maxWidth: 44, lineHeight: 1.2 }}>{store.chain_name}</span>
          )}
        </div>

        {/* Name + distance + coverage */}
        <div className="flex-1 min-w-0 text-right">
          <div className="mb-0.5">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(90deg,#f5c842,#e8a800)', color: '#7a5500', letterSpacing: 0.3 }}>
              הכי משתלמת!
            </span>
          </div>
          <p className="font-bold text-sm" style={{ color: '#4F483F' }}>
            {stripChainPrefix(store.store_name, store.chain_name)}
            <span className="text-xs font-normal ms-1" style={{ color: '#B6AB9C' }}>#{store.store_id}</span>
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: '#8a7f75' }}>📍 {store.distance_km.toFixed(1)} ק&quot;מ</span>
            <span className="text-xs font-medium" style={{ color: store.products_missing > 0 ? '#b85c00' : '#2d7a2d' }}>
              {store.products_found}/{totalItems} מוצרים ({coveragePct}%)
            </span>
          </div>
        </div>

        {/* Price + savings + chevron */}
        <div className="shrink-0 text-right">
          <p className="font-bold text-base" style={{ color: '#b07800' }}>₪{grandTotal.toFixed(2)}</p>
          <p className="text-xs" style={{ color: '#8a7f75' }}>
            🛒 ₪{displayTotal.toFixed(2)} + ⛽ ₪{fuelCost.toFixed(2)}
          </p>
          {hasPromos && (
            <p className="text-xs line-through" style={{ color: '#8a7f75' }}>₪{store.total_price.toFixed(2)}</p>
          )}
          {savings > 0.01 && (
            <p className="text-xs font-bold" style={{ color: '#2d7a2d' }}>חסכון ₪{savings.toFixed(2)}</p>
          )}
        </div>
        <div style={{ color: '#8a7f75', flexShrink: 0 }}>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Coverage bar */}
      <div className="px-4 pb-1">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(182,171,156,0.3)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${coveragePct}%`, background: coveragePct === 100 ? '#2d7a2d' : coveragePct >= 70 ? '#5a8a2d' : '#b85c00' }}
          />
        </div>
      </div>

      {/* Accordion — product list */}
      {open && (
        <div className="px-4 pb-4 pt-2 flex flex-col gap-2">
          {store.items.map((item, idx) => (
            <div
              key={`mce-${item.item_code}-${idx}`}
              className="flex items-center gap-3 p-2.5 rounded-2xl"
              style={{
                background: item.found ? 'rgba(255,255,255,0.7)' : 'rgba(191,44,44,0.06)',
                border: item.found ? '1px solid rgba(182,171,156,0.25)' : '1px solid rgba(191,44,44,0.2)',
              }}
            >
              <ProductImg
                itemCode={item.group_label ? (item.resolved_item_code || item.item_code) : item.item_code}
                name={item.group_label || item.item_name}
                size={36}
              />
              <div className="flex-1 min-w-0">
                {item.group_label && (
                  <p className="text-xs font-bold mb-0.5" style={{ color: '#BF2C2C' }}>📦 {item.group_label}</p>
                )}
                <p className="text-sm font-medium leading-tight" style={{ color: item.found ? '#4F483F' : '#8a7f75', textDecoration: item.found ? 'none' : 'line-through' }}>
                  {item.found ? item.item_name : (item.group_label || item.item_name)}
                </p>
                <p className="text-xs" style={{ color: '#B6AB9C' }}>×{item.quantity}</p>
                {item.promotion_description && (
                  <p className="text-xs font-medium" style={{ color: '#c47a00' }}>🏷️ {item.promotion_description}</p>
                )}
              </div>
              {item.found && (
                <div className="text-right shrink-0">
                  {item.effective_price != null && item.effective_price < item.price! ? (
                    <>
                      <p className="text-sm font-bold" style={{ color: '#2d7a2d' }}>₪{(item.effective_price * item.quantity).toFixed(2)}</p>
                      <p className="text-xs line-through" style={{ color: '#B6AB9C' }}>₪{item.total!.toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="text-sm font-bold" style={{ color: '#2d7a2d' }}>₪{item.total!.toFixed(2)}</p>
                  )}
                  <p className="text-xs" style={{ color: '#8a7f75' }}>₪{item.price!.toFixed(2)} ליח׳</p>
                </div>
              )}
            </div>
          ))}
          {/* שורת עלות דלק */}
          <div
            className="flex items-center gap-3 p-2.5 rounded-2xl"
            style={{ background: 'rgba(100,100,200,0.06)', border: '1px solid rgba(100,100,200,0.18)' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(100,100,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
              ⛽
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight" style={{ color: '#4F483F' }}>עלות נסיעה ממוצעת</p>
              <p className="text-xs" style={{ color: '#8a7f75' }}>הלוך וחזור · {(store.distance_km * 2).toFixed(1)} ק&quot;מ</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold" style={{ color: '#5a5aaa' }}>₪{fuelCost.toFixed(2)}</p>
            </div>
          </div>

          {/* סיכום */}
          <div className="mt-1 p-3 rounded-2xl flex items-center justify-between" style={{ background: 'rgba(176,120,0,0.1)', border: '1px solid rgba(176,120,0,0.2)' }}>
            <span className="text-sm font-bold" style={{ color: '#7a5500' }}>סה&quot;כ כולל נסיעה</span>
            <div className="text-right">
              <p className="text-base font-bold" style={{ color: '#b07800' }}>₪{grandTotal.toFixed(2)}</p>
              <p className="text-xs" style={{ color: '#8a7f75' }}>מוצרים ₪{displayTotal.toFixed(2)} + דלק ₪{fuelCost.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StoreCard ────────────────────────────────────────────────────────────────

function StoreCard({
  store, rank, totalItems, onReplace, onUpdateList,
}: {
  store: StoreResult;
  rank: number;
  totalItems: number;
  onReplace: (storeKey: string, oldCode: string, newItem: ListItem, storePrice: number, groupLabel?: string) => Promise<void>;
  onUpdateList: (store: StoreResult) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [substituteFor, setSubstituteFor] = useState<ItemResult | null>(null);
  const [productDetailFor, setProductDetailFor] = useState<ItemResult | null>(null);
  const [updatingList, setUpdatingList] = useState(false);
  const coveragePct = Math.round((store.products_found / totalItems) * 100);
  const isTop = rank === 1;
  const hasPromos = store.effective_total < store.total_price;
  const displayTotal = hasPromos ? store.effective_total : store.total_price;
  const fuelCost = store.distance_km * 2 * (8 / 15); // round-trip, 8 NIS per 15 km
  const grandTotal = displayTotal + fuelCost;

  // Rank medal colors: gold / silver / bronze / plain
  const medalColors: Record<number, { bg: string; text: string; border: string; shadow: string }> = {
    1: { bg: 'linear-gradient(135deg, #f5c842 0%, #e8a800 60%, #f5c842 100%)', text: '#7a5500', border: 'rgba(229,168,0,0.7)', shadow: '0 0 18px 2px rgba(229,168,0,0.35)' },
    2: { bg: 'linear-gradient(135deg, #d8d8d8 0%, #b0b0b0 60%, #d8d8d8 100%)', text: '#4a4a4a', border: 'rgba(160,160,160,0.6)', shadow: 'none' },
    3: { bg: 'linear-gradient(135deg, #e8a87c 0%, #c47a3a 60%, #e8a87c 100%)', text: '#5a2e00', border: 'rgba(180,100,40,0.5)', shadow: 'none' },
  };
  const medal = medalColors[rank] ?? { bg: '#e8e0d8', text: '#8a7f75', border: 'rgba(182,171,156,0.4)', shadow: 'none' };

  return (
    <>
      <div
        className={`rounded-3xl overflow-hidden${isTop ? ' animate-gold-shimmer' : ''}`}
        style={{
          background: isTop ? 'rgba(245,200,66,0.07)' : 'rgba(233,216,197,0.85)',
          border: isTop ? `2px solid ${medal.border}` : '1.5px solid rgba(182,171,156,0.5)',
        }}
      >
        {/* Header */}
        <button className="w-full flex items-center gap-3 p-4 text-right" onClick={() => setOpen(o => !o)}>

          {/* Rank medal badge + chain logo stacked */}
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <div
              className="flex items-center justify-center font-bold"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: medal.bg,
                color: medal.text,
                boxShadow: rank <= 3 ? `0 2px 6px ${medal.border}` : 'none',
                fontSize: 15,
              }}
            >
              {rank}
            </div>
            {getChainLogoUrl(store.chain_name, store.chain_id) ? (
              <div style={{ width: 44, height: 28, borderRadius: 7, overflow: 'hidden', background: '#fff', border: '1px solid rgba(182,171,156,0.25)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getChainLogoUrl(store.chain_name, store.chain_id)!} alt={store.chain_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <span style={{ fontSize: 9, color: '#8a7f75', textAlign: 'center', maxWidth: 44, lineHeight: 1.2 }}>{store.chain_name}</span>
            )}
          </div>

          {/* Store info */}
          <div className="flex-1 min-w-0 text-right">
            {/* "הכי זול" badge ABOVE store name */}
            {isTop && (
              <div className="mb-0.5">
                <span className="animate-cheapest-badge text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg,#f5c842,#e8a800)', color: '#7a5500', letterSpacing: 0.3 }}>
                  הכי זול! 🏆
                </span>
              </div>
            )}
            {/* Store name */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm" style={{ color: '#4F483F' }}>
                {stripChainPrefix(store.store_name, store.chain_name)}
                <span className="text-xs font-normal ms-1" style={{ color: '#B6AB9C' }}>#{store.store_id}</span>
              </p>
            </div>
            {/* Bottom row: distance + coverage */}
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs" style={{ color: '#8a7f75' }}>📍 {store.distance_km.toFixed(1)} ק&quot;מ</span>
              <span className="text-xs font-medium" style={{ color: store.products_missing > 0 ? '#b85c00' : '#2d7a2d' }}>
                {store.products_found}/{totalItems} מוצרים ({coveragePct}%)
              </span>
              {store.products_missing > 0 && (
                <span className="text-xs" style={{ color: '#BF2C2C' }}>חסרים {store.products_missing}</span>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="shrink-0 text-right">
            <p className="font-bold text-base" style={{ color: isTop ? '#b07800' : '#4F483F' }}>₪{grandTotal.toFixed(2)}</p>
            <p className="text-xs" style={{ color: '#8a7f75' }}>
              🛒 ₪{displayTotal.toFixed(2)} + ⛽ ₪{fuelCost.toFixed(2)}
            </p>
            {hasPromos && (
              <p className="text-xs line-through" style={{ color: '#B6AB9C' }}>₪{store.total_price.toFixed(2)}</p>
            )}
          </div>
          <div style={{ color: '#8a7f75', flexShrink: 0 }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {/* Coverage bar */}
        <div className="px-4 pb-1">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(182,171,156,0.3)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${coveragePct}%`, background: coveragePct === 100 ? '#2d7a2d' : coveragePct >= 70 ? '#5a8a2d' : '#b85c00' }}
            />
          </div>
        </div>

        {/* Product list accordion */}
        {open && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-2">
            {/* עדכון רשימה button */}
            <button
              onClick={async () => { setUpdatingList(true); await onUpdateList(store); setUpdatingList(false); }}
              disabled={updatingList}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, rgba(45,122,45,0.12) 0%, rgba(45,122,45,0.08) 100%)',
                border: '1.5px solid rgba(45,122,45,0.35)',
                color: '#2d7a2d',
                opacity: updatingList ? 0.7 : 1,
              }}
            >
              {updatingList
                ? <div className="animate-spin w-4 h-4 border-2 rounded-full" style={{ borderColor: 'rgba(45,122,45,0.3)', borderTopColor: '#2d7a2d' }} />
                : '🛒'}
              {updatingList ? 'מעדכן...' : `עדכן רשימה לפי ${store.store_name}`}
            </button>

            {store.items.map((item, idx) => (
              <div
                key={`${item.item_code}-${idx}`}
                className="flex flex-col p-2.5 rounded-2xl gap-1"
                style={{
                  background: item.found ? 'rgba(255,255,255,0.6)' : 'rgba(191,44,44,0.06)',
                  border: item.found ? '1px solid rgba(182,171,156,0.25)' : '1px solid rgba(191,44,44,0.2)',
                }}
              >
                {/* Top row: image | name+qty | price+button */}
                <div className="flex items-center gap-3">
                  <ProductImg
                    itemCode={item.group_label ? (item.resolved_item_code || item.item_code) : item.item_code}
                    name={item.group_label || item.item_name}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    {item.group_label && (
                      <p className="text-xs font-bold mb-0.5" style={{ color: item.is_fresh_product ? '#b05a00' : '#BF2C2C' }}>
                        {item.is_fresh_product ? '🥩' : '📦'} {item.group_label}
                      </p>
                    )}
                    {item.found && item.resolved_item_code && item.resolved_item_code !== 'group' ? (
                      <button
                        onClick={e => { e.stopPropagation(); setProductDetailFor(item); }}
                        className="text-right"
                      >
                        <p className="text-sm font-medium leading-tight underline-offset-2 hover:underline" style={{ color: '#4F483F' }}>
                          {item.item_name}
                        </p>
                      </button>
                    ) : (
                      <p className="text-sm font-medium leading-tight"
                        style={{ color: item.found ? '#4F483F' : '#8a7f75', textDecoration: item.found ? 'none' : 'line-through' }}>
                        {item.found ? item.item_name : (item.group_label || item.item_name)}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: '#B6AB9C' }}>×{item.quantity}</p>
                  </div>
                  {/* Price + replace button */}
                  {item.found ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {item.effective_price != null && item.effective_price < item.price! ? (
                          <>
                            <p className="text-sm font-bold" style={{ color: '#2d7a2d' }}>
                              ₪{(item.effective_price * item.quantity).toFixed(2)}
                            </p>
                            <p className="text-xs line-through" style={{ color: '#B6AB9C' }}>
                              ₪{item.total!.toFixed(2)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold" style={{ color: '#2d7a2d' }}>₪{item.total!.toFixed(2)}</p>
                            {!item.promotion_description && (
                              item.is_fresh_product
                                ? <p className="text-xs" style={{ color: '#b05a00' }}>לק&quot;ג</p>
                                : <p className="text-xs" style={{ color: '#8a7f75' }}>₪{item.price!.toFixed(2)} ליח׳</p>
                            )}
                          </>
                        )}
                        {item.unit_price != null && item.unit_price > 0 && (
                          <p className="text-xs" style={{ color: '#8a7f75' }}>₪{item.unit_price.toFixed(2)}/100ג׳</p>
                        )}
                      </div>
                      <button
                        onClick={() => setSubstituteFor(item)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-xl font-medium"
                        style={{ background: 'rgba(100,100,100,0.08)', color: '#8a7f75', border: '1px solid rgba(182,171,156,0.35)' }}
                        title="החלף מוצר"
                      >
                        <RefreshCw size={11} />
                        החלף
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSubstituteFor(item)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl font-medium shrink-0"
                      style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C', border: '1px solid rgba(191,44,44,0.25)' }}
                    >
                      <RefreshCw size={12} />
                      תחליף
                    </button>
                  )}
                </div>

                {/* Promo description — full-width row below, only when present */}
                {item.found && item.promotion_description && (
                  <p className="text-xs font-medium px-1" style={{
                    color: item.effective_price != null && item.effective_price < item.price! ? '#2d7a2d' : '#c47a00',
                  }}>
                    🏷️ {item.promotion_description}
                  </p>
                )}
              </div>
            ))}

            {/* שורת עלות דלק */}
            <div
              className="flex items-center gap-3 p-2.5 rounded-2xl"
              style={{ background: 'rgba(100,100,200,0.06)', border: '1px solid rgba(100,100,200,0.18)' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(100,100,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                ⛽
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight" style={{ color: '#4F483F' }}>עלות נסיעה ממוצעת</p>
                <p className="text-xs" style={{ color: '#8a7f75' }}>הלוך וחזור · {(store.distance_km * 2).toFixed(1)} ק&quot;מ</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold" style={{ color: '#5a5aaa' }}>₪{fuelCost.toFixed(2)}</p>
              </div>
            </div>

            {/* סיכום כולל נסיעה */}
            <div className="mt-1 p-3 rounded-2xl flex items-center justify-between" style={{ background: 'rgba(79,72,63,0.07)', border: '1px solid rgba(79,72,63,0.15)' }}>
              <span className="text-sm font-bold" style={{ color: '#4F483F' }}>סה&quot;כ כולל נסיעה</span>
              <div className="text-right">
                <p className="text-base font-bold" style={{ color: isTop ? '#b07800' : '#4F483F' }}>₪{grandTotal.toFixed(2)}</p>
                <p className="text-xs" style={{ color: '#8a7f75' }}>מוצרים ₪{displayTotal.toFixed(2)} + דלק ₪{fuelCost.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {productDetailFor && (
        <ProductDetailSheet
          item={productDetailFor}
          onClose={() => setProductDetailFor(null)}
        />
      )}

      {substituteFor && (
        <SubstituteSheet
          item={substituteFor}
          chainId={store.chain_id}
          storeId={store.store_id}
          onClose={() => setSubstituteFor(null)}
          onReplace={async (oldCode, newItem, storePrice) => { await onReplace(store.store_key, oldCode, newItem, storePrice, substituteFor?.group_label); setSubstituteFor(null); }}
        />
      )}
    </>
  );
}

// ─── LocationStep ─────────────────────────────────────────────────────────────

function LocationStep({ onLocate }: { onLocate: (lat: number, lng: number, label: string) => void }) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState('');

  const handleGps = () => {
    if (!navigator.geolocation) { setGpsError('הדפדפן לא תומך ב-GPS'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsLoading(false); onLocate(pos.coords.latitude, pos.coords.longitude, 'מיקום נוכחי'); },
      () => { setGpsLoading(false); setGpsError('לא ניתן לקבל מיקום. אנא הזן עיר.'); },
    );
  };

  const handleCity = async () => {
    if (!cityQuery.trim()) return;
    setCityLoading(true);
    setCityError('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityQuery + ', ישראל')}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'he' } },
      );
      const data = await res.json();
      if (data?.[0]) {
        onLocate(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name.split(',')[0]);
      } else {
        setCityError('לא נמצאה עיר. נסה שם אחר.');
      }
    } catch {
      setCityError('שגיאה בחיפוש. נסה שוב.');
    }
    setCityLoading(false);
  };

  return (
    <div className="rounded-3xl p-6 flex flex-col gap-5" style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.5)' }}>
      <div className="flex items-center gap-3">
        <MapPin size={28} style={{ color: '#BF2C2C', flexShrink: 0 }} />
        <div>
          <p className="font-bold" style={{ color: '#4F483F' }}>בחר מיקום</p>
          <p className="text-sm" style={{ color: '#8a7f75' }}>כדי למצוא חנויות קרובות אליך</p>
        </div>
      </div>

      <button
        onClick={handleGps}
        disabled={gpsLoading}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-semibold text-sm"
        style={{ background: '#BF2C2C', color: 'white', opacity: gpsLoading ? 0.7 : 1 }}
      >
        {gpsLoading
          ? <div className="animate-spin w-4 h-4 border-2 rounded-full" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'white' }} />
          : <Navigation size={16} />}
        {gpsLoading ? 'מאתר מיקום...' : 'השתמש במיקום הנוכחי'}
      </button>
      {gpsError && <p className="text-xs text-center" style={{ color: '#BF2C2C' }}>{gpsError}</p>}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'rgba(182,171,156,0.4)' }} />
        <span className="text-xs" style={{ color: '#8a7f75' }}>או</span>
        <div className="flex-1 h-px" style={{ background: 'rgba(182,171,156,0.4)' }} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(182,171,156,0.4)', color: '#4F483F', direction: 'rtl' }}
          placeholder="הזן שם עיר..."
          value={cityQuery}
          onChange={e => setCityQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCity()}
        />
        <button
          onClick={handleCity}
          disabled={cityLoading}
          className="px-4 py-2.5 rounded-xl font-semibold text-sm"
          style={{ background: '#4F483F', color: 'white', opacity: cityLoading ? 0.7 : 1 }}
        >
          {cityLoading ? '...' : 'חפש'}
        </button>
      </div>
      {cityError && <p className="text-xs" style={{ color: '#BF2C2C' }}>{cityError}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Session persistence key ──────────────────────────────────────────────────
const COMPARE_SESSION_KEY = 'superzol_compare_session';

// ─── Incremental fetch cache ──────────────────────────────────────────────────
const COMPARE_CACHE_KEY = 'superzol_compare_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheBaseItem = { item_code: string; group_label?: string; quantity: number };

type CompareCache = {
  timestamp: number;
  baseItems: CacheBaseItem[];
  storeResults: StoreResult[];
  mostCostEffectiveKey: string | null;
};

function loadCache(): CompareCache | null {
  try {
    const raw = sessionStorage.getItem(COMPARE_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CompareCache;
    if (Date.now() - c.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(COMPARE_CACHE_KEY);
      return null;
    }
    return c;
  } catch { return null; }
}

function saveCache(data: CompareCache) {
  try { sessionStorage.setItem(COMPARE_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function clearCache() {
  try { sessionStorage.removeItem(COMPARE_CACHE_KEY); } catch { /* ignore */ }
}

/** Unique key for a ListItem — used to match items across cache and current basket */
function itemKey(item: { item_code: string; group_label?: string }): string {
  return item.item_code === 'group' ? `group:${item.group_label ?? ''}` : item.item_code;
}

/**
 * Merge new API results (for newItems only) into cached store results.
 * For each store in newResults, find the matching store in cachedStores by store_key
 * and append the new items + update totals. Stores not in newResults are left unchanged.
 */
function mergeStoreResults(cachedStores: StoreResult[], newResults: StoreResult[]): StoreResult[] {
  const newByKey = new Map<string, StoreResult>(newResults.map(s => [s.store_key, s]));

  return cachedStores.map(cached => {
    const incoming = newByKey.get(cached.store_key);
    if (!incoming) return cached; // store not in new results — keep as-is

    const mergedItems = [...cached.items, ...incoming.items];
    return {
      ...cached,
      items: mergedItems,
      products_found: cached.products_found + incoming.products_found,
      products_missing: cached.products_missing + incoming.products_missing,
      total_price: cached.total_price + incoming.total_price,
      effective_total: cached.effective_total + incoming.effective_total,
      fuel_adjusted_total: cached.fuel_adjusted_total + incoming.fuel_adjusted_total,
    };
  });
}

type CompareSession = {
  stores: StoreResult[];
  mostCostEffectiveKey: string | null;
  location: Location;
  radiusKm: number;
  currentItems: ListItem[];
  promoFulfilled: boolean;
  originalItems: ListItem[];
};

function saveSession(data: CompareSession) {
  try { sessionStorage.setItem(COMPARE_SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadSession(): CompareSession | null {
  try {
    const raw = sessionStorage.getItem(COMPARE_SESSION_KEY);
    return raw ? (JSON.parse(raw) as CompareSession) : null;
  } catch { return null; }
}

function clearSession() {
  try { sessionStorage.removeItem(COMPARE_SESSION_KEY); } catch { /* ignore */ }
}

export default function ComparePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [stores, setStores] = useState<StoreResult[]>([]);
  const [mostCostEffectiveKey, setMostCostEffectiveKey] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compared, setCompared] = useState(false);
  const [currentItems, setCurrentItems] = useState<ListItem[]>([]);
  const [promoFulfilled, setPromoFulfilled] = useState(false);
  const originalItemsRef = useRef<ListItem[]>([]); // snapshot of quantities before promo fulfillment
  const resultsRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);
  const sessionRestoredRef = useRef(false); // prevent auto-compare from firing before session restore

  // ── Compute promo-fulfillment suggestions ──
  // For each item in currentItems, find the best promo_min_qty across all stores
  // and suggest increasing quantity if promo_min_qty > current quantity
  const promoSuggestions: PromoSuggestion[] = (() => {
    const suggestions: PromoSuggestion[] = [];
    for (const item of currentItems) {
      const isGroup = item.item_code === 'group';
      let bestSuggestion: PromoSuggestion | null = null;
      for (const store of stores) {
        // For group items: match by group_label; for regular items: match by item_code
        const storeItem = store.items.find(si => {
          if (isGroup) return si.group_label === item.group_label;
          return si.item_code === item.item_code || si.resolved_item_code === item.item_code;
        });
        if (!storeItem || !storeItem.found) continue;
        const minQty = storeItem.promo_min_qty;
        if (!minQty || minQty <= item.quantity) continue;
        // Pick the LARGEST minQty across all stores so ALL stores' promos are satisfied
        if (!bestSuggestion || minQty > bestSuggestion.suggested_qty) {
          bestSuggestion = {
            item_code: item.item_code,
            group_label: isGroup ? item.group_label : undefined,
            item_name: storeItem.item_name || item.item_name,
            current_qty: item.quantity,
            suggested_qty: minQty,
            promotion_description: storeItem.promotion_description || 'מבצע',
            store_name: store.store_name,
          };
        }
      }
      if (bestSuggestion) suggestions.push(bestSuggestion);
    }
    return suggestions;
  })();

  // ── Restore session on mount (before loading user) ──
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setStores(session.stores);
      setMostCostEffectiveKey(session.mostCostEffectiveKey);
      setLocation(session.location);
      setRadiusKm(session.radiusKm);
      setCurrentItems(session.currentItems);
      setPromoFulfilled(session.promoFulfilled);
      originalItemsRef.current = session.originalItems;
      setCompared(true);
      sessionRestoredRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load user + shopping list + saved location
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoadingUser(false); return; }
      setLoggedIn(true);
      userIdRef.current = user.id;

      // Load shopping list items (including group_id)
      const { data: rawItems } = await supabase
        .from('shopping_list_items')
        .select('item_code, item_name, quantity, group_id')
        .eq('user_id', user.id)
        .eq('checked', false);

      if (rawItems?.length) {
        // Resolve each item: regular items get enriched from index, group items get candidate codes
        const enriched = await Promise.all(
          (rawItems as { item_code: string; item_name: string; quantity: number; group_id: string | null }[]).map(async (item) => {
            // ── Group item ──
            if (item.item_code === 'group' && item.group_id) {
              // Fetch group items (always needed) and group metadata (is_fresh_product) in parallel
              // is_fresh_product fetch is best-effort — defaults to false if column doesn't exist yet
              const [groupItemsResult, groupMetaResult] = await Promise.all([
                supabase
                  .from('product_group_items')
                  .select('item_code')
                  .eq('group_id', item.group_id),
                Promise.resolve(
                  supabase
                    .from('product_groups')
                    .select('is_fresh_product, image_item_code')
                    .eq('id', item.group_id)
                    .single()
                ).catch(() => ({ data: null, error: null })),
              ]);

              const candidateCodes = (groupItemsResult.data || []).map((gi: { item_code: string }) => gi.item_code);
              const groupMeta = groupMetaResult?.data as { is_fresh_product?: boolean; image_item_code?: string | null } | null;
              const isFresh = groupMeta?.is_fresh_product ?? false;
              const imageItemCode = groupMeta?.image_item_code ?? null;

              return {
                item_code: 'group',
                item_name: item.item_name,
                quantity: item.quantity,
                group_id: item.group_id,
                group_label: item.item_name,
                candidate_codes: isFresh ? [] : candidateCodes,
                is_fresh_product: isFresh,
                image_item_code: imageItemCode,
              } as ListItem;
            }

            // ── Regular item: enrich name from index ──
            const p = await fetchProductFromIndex(item.item_code);
            return {
              item_code: item.item_code,
              item_name: p?.item_name || item.item_name,
              quantity: item.quantity,
            } as ListItem;
          })
        );

        setListItems(enriched);
        setCurrentItems(enriched);
      }

      // Load saved location
      const savedLoc = await getUserLocation();
      if (savedLoc) {
        setLocation(savedLoc);
      }

      setLoadingUser(false);
    });
  }, []);

  const runCompare = useCallback(async (items: ListItem[], loc: Location, radius: number, promoFulfilledState = false, originalItems: ListItem[] = []) => {
    setComparing(true);
    setCompareError('');
    setStores([]);
    setMostCostEffectiveKey(null);

    try {
      // ── Incremental fetch logic ──────────────────────────────────────────────
      const cache = loadCache();

      // Build a map of current items by key → quantity
      const currentMap = new Map<string, { item: ListItem; qty: number }>(
        items.map(it => [itemKey(it), { item: it, qty: it.quantity }])
      );

      let finalStores: StoreResult[];
      let finalMceKey: string | null;

      // Determine if cache is usable:
      // - cache must exist
      // - no item removed or quantity changed (only additions allowed for incremental)
      let cacheUsable = false;
      let newItems: ListItem[] = [];

      if (cache) {
        const baseMap = new Map<string, CacheBaseItem>(
          cache.baseItems.map(bi => [itemKey(bi), bi])
        );

        // Check for removals or quantity changes
        let hasRemovedOrChanged = false;
        for (const bi of cache.baseItems) {
          const key = itemKey(bi);
          const current = currentMap.get(key);
          if (!current || current.qty !== bi.quantity) {
            hasRemovedOrChanged = true;
            break;
          }
        }

        if (!hasRemovedOrChanged) {
          // Find truly new items (not in cache baseItems)
          newItems = items.filter(it => !baseMap.has(itemKey(it)));
          cacheUsable = true;
        }
      }

      if (cacheUsable && cache) {
        if (newItems.length === 0) {
          // Nothing new — use cache directly, preserve original MCE key
          finalStores = cache.storeResults;
          finalMceKey = cache.mostCostEffectiveKey;
        } else {
          // Fetch only new items, merge with cache
          const res = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius_km: radius, items: newItems }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'שגיאה');
          const newStores: StoreResult[] = data.stores || [];
          finalStores = mergeStoreResults(cache.storeResults, newStores);
          // Recalculate MCE key from merged totals (basket changed)
          finalMceKey = finalStores.length > 0
            ? finalStores.reduce((a, b) => a.fuel_adjusted_total <= b.fuel_adjusted_total ? a : b).store_key
            : null;
        }
      } else {
        // Full fetch — cache invalid or missing
        clearCache();
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius_km: radius, items }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'שגיאה');
        finalStores = data.stores || [];
        // Use API's authoritative MCE key
        finalMceKey = data.most_cost_effective_key ?? null;
      }

      // Save updated cache (including MCE key so re-runs without changes preserve it)
      saveCache({
        timestamp: Date.now(),
        baseItems: items.map(it => ({ item_code: it.item_code, group_label: it.group_label, quantity: it.quantity })),
        storeResults: finalStores,
        mostCostEffectiveKey: finalMceKey,
      });

      setStores(finalStores);
      setMostCostEffectiveKey(finalMceKey);
      setCompared(true);

      // Persist session so navigation away and back restores results
      saveSession({
        stores: finalStores,
        mostCostEffectiveKey: finalMceKey,
        location: loc,
        radiusKm: radius,
        currentItems: items,
        promoFulfilled: promoFulfilledState,
        originalItems,
      });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setCompareError((e as Error).message || 'שגיאה בהשוואה');
    }
    setComparing(false);
  }, []);

  // Auto-compare when location + items ready (skip if session was just restored)
  useEffect(() => {
    if (sessionRestoredRef.current) {
      // Session was restored — don't auto-compare, but clear the flag so future changes work
      sessionRestoredRef.current = false;
      return;
    }
    if (location && currentItems.length > 0 && !compared && !comparing) {
      runCompare(currentItems, location, radiusKm);
    }
  }, [location, currentItems, compared, comparing, radiusKm, runCompare]);

  const handleLocate = (lat: number, lng: number, label: string) => {
    clearSession(); // new location = fresh compare
    clearCache();   // new location = cache invalid
    const loc = { lat, lng, label };
    setLocation(loc);
    setCompared(false);
    setStores([]);
    // Save location for next time
    saveUserLocation(lat, lng, label);
  };

  const handleReplace = useCallback(async (storeKey: string, oldCode: string, newItem: ListItem, storePrice: number, groupLabel?: string) => {
    // For the triggering store: replace with the verified storePrice.
    // For other stores that have the SAME item as MISSING: check if the substitute exists there
    // and fill it in if found. Stores that already have the original item found are not touched.
    const currentStores = stores;

    // Helper to apply a replacement to a single store's items
    const applyReplacement = (s: StoreResult, price: number): StoreResult => {
      const updatedItems = s.items.map(item => {
        const isMatch = groupLabel
          ? item.group_label === groupLabel
          : item.item_code === oldCode;
        if (!isMatch) return item;
        const quantity = item.quantity;
        return {
          ...item,
          item_code: newItem.item_code,
          item_name: newItem.item_name,
          resolved_item_code: newItem.item_code,
          group_label: undefined,
          found: true,
          price,
          total: price * quantity,
          effective_price: null,
          promotion_description: null,
        };
      });
      const foundCount = updatedItems.filter(i => i.found).length;
      const total = updatedItems.reduce((sum, i) => sum + (i.total || 0), 0);
      const effectiveTotal = updatedItems.reduce((sum, i) => {
        if (!i.found) return sum;
        const ep = i.effective_price != null && i.effective_price < (i.price ?? Infinity)
          ? i.effective_price : i.price ?? 0;
        return sum + ep * i.quantity;
      }, 0);
      return {
        ...s,
        items: updatedItems,
        products_found: foundCount,
        products_missing: updatedItems.length - foundCount,
        total_price: total,
        effective_total: effectiveTotal,
        fuel_adjusted_total: effectiveTotal + s.distance_km * 2 * (8 / 15),
      };
    };

    // Process all stores in parallel
    const updatedStores = await Promise.all(
      currentStores.map(async (s) => {
        if (s.store_key === storeKey) {
          // Triggering store — price already verified
          return applyReplacement(s, storePrice);
        }

        // Other stores: only fill in if the item is currently MISSING
        const existingItem = groupLabel
          ? s.items.find(i => i.group_label === groupLabel)
          : s.items.find(i => i.item_code === oldCode);

        // Skip if item not in this store, or if it's already found (don't override)
        if (!existingItem || existingItem.found) return s;

        // Check if substitute exists in this store
        const price = await checkItemInStore(s.chain_id, s.store_id, newItem.item_code);
        if (price === null) return s; // substitute not available here — leave as missing

        return applyReplacement(s, price);
      })
    );

    // Re-sort by same logic as API: most found first, then lowest effective_total (with promos)
    const sortedStores = [...updatedStores].sort((a, b) => {
      if (b.products_found !== a.products_found) return b.products_found - a.products_found;
      return a.effective_total - b.effective_total;
    });
    setStores(sortedStores);

    // Persist replacement to Supabase shopping_list_items
    const userId = userIdRef.current;
    if (userId) {
      await supabase
        .from('shopping_list_items')
        .update({ item_code: newItem.item_code, item_name: newItem.item_name })
        .eq('user_id', userId)
        .eq('item_code', oldCode);
    }

    // Update currentItems so re-compare uses the new item code
    const updatedCurrentItems = currentItems.map(i =>
      i.item_code === oldCode
        ? { ...i, item_code: newItem.item_code, item_name: newItem.item_name }
        : i
    );
    setCurrentItems(updatedCurrentItems);
    setListItems(prev =>
      prev.map(i =>
        i.item_code === oldCode
          ? { ...i, item_code: newItem.item_code, item_name: newItem.item_name }
          : i
      )
    );

    // Persist updated session
    if (location) {
      saveSession({
        stores: sortedStores,
        mostCostEffectiveKey,
        location,
        radiusKm,
        currentItems: updatedCurrentItems,
        promoFulfilled,
        originalItems: originalItemsRef.current,
      });
    }
  }, [stores, currentItems, location, radiusKm, mostCostEffectiveKey, promoFulfilled]);

  // ── Handle promo fulfillment: LOCAL only — no Supabase update ──
  // Quantity changes are only for the compare view; use "עדכון רשימה" to persist to Supabase
  const handlePromoFulfill = useCallback(async (suggestions: PromoSuggestion[]) => {
    // Snapshot original quantities before modifying anything
    const snapshot = currentItems.map(i => ({ ...i }));
    originalItemsRef.current = snapshot;

    // Update local state only (currentItems — listItems stays as original)
    // For group items: match by group_label; for regular items: match by item_code
    const updatedItems = currentItems.map(i => {
      const isGroup = i.item_code === 'group';
      const suggestion = suggestions.find(s =>
        isGroup
          ? s.group_label === i.group_label
          : s.item_code === i.item_code
      );
      return suggestion ? { ...i, quantity: suggestion.suggested_qty } : i;
    });
    setCurrentItems(updatedItems);
    setPromoFulfilled(true);

    // Re-run compare with updated quantities (pass promoFulfilled=true + snapshot for session)
    if (location) {
      setCompared(false);
      await runCompare(updatedItems, location, radiusKm, true, snapshot);
    }
  }, [currentItems, location, radiusKm, runCompare]);

  // ── Handle promo cancel: restore original quantities (local only) ──
  const handlePromoCancel = useCallback(() => {
    const originals = originalItemsRef.current;
    if (originals.length === 0) return;

    originalItemsRef.current = [];
    setPromoFulfilled(false);
    setListItems(originals);
    setCurrentItems(originals);
    // Setting compared=false triggers the auto-compare useEffect with restored quantities
    setCompared(false);
  }, []);

  // ── Handle "עדכון רשימה": save store list to sessionStorage (supports multiple lists) ──
  const handleUpdateList = useCallback((store: StoreResult) => {
    // Build a flat list of resolved items (group items → actual barcode)
    const storeListItems = store.items
      .filter(i => i.found)
      .map(i => ({
        item_code: i.resolved_item_code || i.item_code,
        item_name: i.item_name,
        quantity: i.quantity,
        price: i.effective_price ?? i.price,
      }));

    try {
      // Load existing lists, replace if same store already saved, otherwise append
      const raw = sessionStorage.getItem('superzol_store_lists');
      const existing: { store_name: string; items: typeof storeListItems }[] = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter(l => l.store_name !== store.store_name);
      filtered.push({ store_name: store.store_name, items: storeListItems });
      sessionStorage.setItem('superzol_store_lists', JSON.stringify(filtered));
      // Also keep legacy key for header display (last saved store)
      sessionStorage.setItem('superzol_list_store', store.store_name);
    } catch { /* ignore */ }
  }, []);

  // ── Loading ──
  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#DAD1CA' }}>
        <div className="animate-spin w-8 h-8 border-2 rounded-full" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Image src="/icons/compare.png" alt="השוואה" width={32} height={32} />
          <h1 className="text-xl font-bold" style={{ color: '#4F483F', fontFamily: 'Rubik, Heebo, sans-serif' }}>
            השוואת סל קניות
          </h1>
        </div>

        {/* Not logged in */}
        {!loggedIn ? (
          <div className="flex flex-col items-center gap-4 p-10 rounded-3xl text-center" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.5)' }}>
            <ShoppingCart size={48} style={{ color: '#B6AB9C' }} />
            <p className="font-semibold" style={{ color: '#4F483F' }}>יש להתחבר כדי להשוות</p>
            <Link href="/login" className="text-sm px-5 py-2 rounded-xl font-medium" style={{ background: '#BF2C2C', color: 'white' }}>התחבר</Link>
          </div>

        ) : listItems.length === 0 ? (
          <div className="flex flex-col items-center gap-4 p-10 rounded-3xl text-center" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.5)' }}>
            <ShoppingCart size={48} style={{ color: '#B6AB9C' }} />
            <p className="font-semibold" style={{ color: '#4F483F' }}>רשימת הקניות ריקה</p>
            <p className="text-sm" style={{ color: '#8a7f75' }}>הוסף מוצרים לרשימה כדי להשוות מחירים</p>
            <Link href="/search" className="text-sm px-5 py-2 rounded-xl font-medium" style={{ background: '#BF2C2C', color: 'white' }}>חפש מוצרים</Link>
          </div>

        ) : (
          <>
            {/* Summary bar */}
            <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
              <ShoppingCart size={18} style={{ color: '#8a7f75', flexShrink: 0 }} />
              <p className="text-sm" style={{ color: '#4F483F' }}>
                <span className="font-bold">{currentItems.length}</span> מוצרים ברשימה
              </p>
              {location && (
                <div className="flex items-center gap-1 mr-auto">
                  <MapPin size={14} style={{ color: '#BF2C2C' }} />
                  <span className="text-xs" style={{ color: '#8a7f75' }}>{location.label}</span>
                  <button onClick={() => { clearSession(); setLocation(null); setStores([]); setCompared(false); setPromoFulfilled(false); originalItemsRef.current = []; }} style={{ color: '#8a7f75', marginRight: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Location step */}
            {!location && (
              <div className="mb-5">
                <LocationStep onLocate={handleLocate} />
              </div>
            )}

            {/* Radius selector */}
            {location && (
              <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
                <span className="text-sm" style={{ color: '#4F483F' }}>רדיוס חיפוש:</span>
                {[5, 10, 15, 25].map(r => (
                  <button
                    key={r}
                    onClick={() => { setRadiusKm(r); setCompared(false); }}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium"
                    style={{
                      background: radiusKm === r ? '#4F483F' : 'rgba(255,255,255,0.5)',
                      color: radiusKm === r ? 'white' : '#4F483F',
                      border: '1px solid rgba(182,171,156,0.4)',
                    }}
                  >
                    {r} ק&quot;מ
                  </button>
                ))}
                <button
                  onClick={() => runCompare(currentItems, location, radiusKm)}
                  disabled={comparing}
                  className="mr-auto text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1"
                  style={{ background: '#BF2C2C', color: 'white', opacity: comparing ? 0.7 : 1 }}
                >
                  {comparing
                    ? <div className="animate-spin w-3 h-3 border-2 rounded-full" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'white' }} />
                    : <RefreshCw size={13} />}
                  {comparing ? 'מחשב...' : 'חשב מחדש'}
                </button>
              </div>
            )}

            {/* Comparing spinner */}
            {comparing && (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="animate-spin w-10 h-10 border-3 rounded-full" style={{ borderColor: '#B6AB9C', borderTopColor: '#BF2C2C', borderWidth: 3 }} />
                <p className="text-sm font-medium" style={{ color: '#4F483F' }}>מחפש חנויות ומחשב מחירים...</p>
                <p className="text-xs" style={{ color: '#8a7f75' }}>זה עשוי לקחת כמה שניות</p>
              </div>
            )}

            {/* Error */}
            {compareError && (
              <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(191,44,44,0.08)', border: '1px solid rgba(191,44,44,0.25)' }}>
                <p className="text-sm text-center" style={{ color: '#BF2C2C' }}>{compareError}</p>
              </div>
            )}

            {/* No stores found */}
            {compared && stores.length === 0 && !comparing && (
              <div className="rounded-3xl p-8 text-center" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.5)' }}>
                <MapPin size={36} style={{ color: '#B6AB9C', margin: '0 auto 12px' }} />
                <p className="font-semibold" style={{ color: '#4F483F' }}>לא נמצאו חנויות באזור</p>
                <p className="text-sm mt-1" style={{ color: '#8a7f75' }}>נסה להגדיל את רדיוס החיפוש</p>
              </div>
            )}

            {/* Results */}
            {stores.length > 0 && (
              <div ref={resultsRef} className="flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold" style={{ color: '#4F483F' }}>
                    {stores.length} חנויות נמצאו
                  </p>
                  <p className="text-xs" style={{ color: '#8a7f75' }}>ממוינות לפי כיסוי ומחיר</p>
                </div>

                {/* מימוש מבצעים / ביטול מבצעים button */}
                {(promoSuggestions.length > 0 || promoFulfilled) && (
                  <button
                    onClick={() => promoFulfilled ? handlePromoCancel() : handlePromoFulfill(promoSuggestions)}
                    className="w-full rounded-2xl px-4 py-3 flex flex-col items-center gap-0.5"
                    style={{
                      background: promoFulfilled
                        ? 'linear-gradient(135deg, rgba(45,122,45,0.12) 0%, rgba(45,122,45,0.08) 100%)'
                        : 'linear-gradient(135deg, rgba(196,122,0,0.12) 0%, rgba(196,122,0,0.08) 100%)',
                      border: promoFulfilled
                        ? '1.5px solid rgba(45,122,45,0.35)'
                        : '1.5px solid rgba(196,122,0,0.35)',
                    }}
                  >
                    <span className="text-sm font-bold" style={{ color: promoFulfilled ? '#2d7a2d' : '#7a5500' }}>
                      {promoFulfilled ? '✓ ביטול מבצעים' : `🏷️ מימוש מבצעים (${promoSuggestions.length})`}
                    </span>
                    <span className="text-xs" style={{ color: promoFulfilled ? '#2d7a2d' : '#b07800' }}>
                      {promoFulfilled ? '*לחץ לביטול והחזרת הכמויות המקוריות' : '*הוספת מוצרים כדי לממש מבצע'}
                    </span>
                  </button>
                )}

                {/* ⭐ Most cost-effective store — always shown above ranking table */}
                {mostCostEffectiveKey && (() => {
                  const mceStore = stores.find(s => s.store_key === mostCostEffectiveKey);
                  const cheapestTotal = stores[0]?.total_price ?? 0;
                  return mceStore ? (
                    <MostCostEffectiveCard
                      store={mceStore}
                      totalItems={currentItems.length}
                      cheapestTotal={cheapestTotal}
                    />
                  ) : null;
                })()}

                {/* 🏆 Ranking table */}
                {stores.map((store, idx) => (
                  <StoreCard
                    key={store.store_key}
                    store={store}
                    rank={idx + 1}
                    totalItems={currentItems.length}
                    onReplace={handleReplace}
                    onUpdateList={handleUpdateList}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
