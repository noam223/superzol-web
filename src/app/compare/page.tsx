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
  items: ItemResult[];
};

type IndexProduct = {
  item_code: string;
  item_name: string;
  min_price: number;
  chain_count: number;
};

type Location = { lat: number; lng: number; label: string };

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

// ─── StoreCard ────────────────────────────────────────────────────────────────

function StoreCard({
  store, rank, totalItems, onReplace,
}: {
  store: StoreResult;
  rank: number;
  totalItems: number;
  onReplace: (storeKey: string, oldCode: string, newItem: ListItem, storePrice: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [substituteFor, setSubstituteFor] = useState<ItemResult | null>(null);
  const coveragePct = Math.round((store.products_found / totalItems) * 100);
  const isTop = rank === 1;

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

          {/* Rank medal badge */}
          <div
            className="shrink-0 flex items-center justify-center font-bold"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: medal.bg,
              color: medal.text,
              boxShadow: rank <= 3 ? `0 2px 6px ${medal.border}` : 'none',
              flexShrink: 0,
              fontSize: 15,
            }}
          >
            {rank}
          </div>

          {/* Store info */}
          <div className="flex-1 min-w-0 text-right">
            {/* Top row: logo + store name */}
            <div className="flex items-center gap-2 flex-wrap">
              {getChainLogoUrl(store.chain_name) ? (
                <div className="shrink-0 flex items-center justify-center" style={{
                  width: 52, height: 32, borderRadius: 8,
                  overflow: 'hidden', background: '#fff',
                  border: '1px solid rgba(182,171,156,0.25)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  padding: 3,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getChainLogoUrl(store.chain_name)!} alt={store.chain_name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(182,171,156,0.3)', color: '#8a7f75' }}>
                  {store.chain_name}
                </span>
              )}
              <p className="font-bold text-sm" style={{ color: '#4F483F' }}>{store.store_name}</p>
              {isTop && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg,#f5c842,#e8a800)', color: '#7a5500', letterSpacing: 0.3 }}>
                  הכי זול! 🏆
                </span>
              )}
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
            <p className="font-bold text-base" style={{ color: isTop ? '#b07800' : '#4F483F' }}>₪{store.total_price.toFixed(2)}</p>
            <p className="text-xs" style={{ color: '#8a7f75' }}>לפריטים שנמצאו</p>
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
            {store.items.map((item, idx) => (
              <div
                key={`${item.item_code}-${idx}`}
                className="flex items-center gap-3 p-2.5 rounded-2xl"
                style={{
                  background: item.found ? 'rgba(255,255,255,0.6)' : 'rgba(191,44,44,0.06)',
                  border: item.found ? '1px solid rgba(182,171,156,0.25)' : '1px solid rgba(191,44,44,0.2)',
                }}
              >
                {/* Image: for group items use image_item_code; for regular items use item_code */}
                <ProductImg
                  itemCode={item.group_label ? (item.image_item_code || item.item_code) : item.item_code}
                  name={item.group_label || item.item_name}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  {/* Group label badge */}
                  {item.group_label && (
                    <p className="text-xs font-bold mb-0.5" style={{ color: item.is_fresh_product ? '#b05a00' : '#BF2C2C' }}>
                      {item.is_fresh_product ? '🥩' : '📦'} {item.group_label}
                    </p>
                  )}
                  <p
                    className="text-sm font-medium leading-tight"
                    style={{ color: item.found ? '#4F483F' : '#8a7f75', textDecoration: item.found ? 'none' : 'line-through' }}
                  >
                    {item.found
                      ? item.item_name  // Actual resolved product name
                      : (item.group_label || item.item_name)  // Group name when not found
                    }
                  </p>
                  {item.quantity > 1 && <p className="text-xs" style={{ color: '#B6AB9C' }}>×{item.quantity}</p>}
                </div>
                {item.found ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: '#2d7a2d' }}>₪{item.total!.toFixed(2)}</p>
                      {item.is_fresh_product
                        ? <p className="text-xs" style={{ color: '#b05a00' }}>לק&quot;ג</p>
                        : item.quantity > 1 && <p className="text-xs" style={{ color: '#8a7f75' }}>₪{item.price!.toFixed(2)} ליח׳</p>
                      }
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
            ))}
          </div>
        )}
      </div>

      {substituteFor && (
        <SubstituteSheet
          item={substituteFor}
          chainId={store.chain_id}
          storeId={store.store_id}
          onClose={() => setSubstituteFor(null)}
          onReplace={async (oldCode, newItem, storePrice) => { await onReplace(store.store_key, oldCode, newItem, storePrice); setSubstituteFor(null); }}
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

export default function ComparePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [stores, setStores] = useState<StoreResult[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compared, setCompared] = useState(false);
  const [currentItems, setCurrentItems] = useState<ListItem[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load user + shopping list + saved location
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoadingUser(false); return; }
      setLoggedIn(true);

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

  const runCompare = useCallback(async (items: ListItem[], loc: Location, radius: number) => {
    setComparing(true);
    setCompareError('');
    setStores([]);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius_km: radius, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      setStores(data.stores || []);
      setCompared(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setCompareError((e as Error).message || 'שגיאה בהשוואה');
    }
    setComparing(false);
  }, []);

  // Auto-compare when location + items ready
  useEffect(() => {
    if (location && currentItems.length > 0 && !compared && !comparing) {
      runCompare(currentItems, location, radiusKm);
    }
  }, [location, currentItems, compared, comparing, radiusKm, runCompare]);

  const handleLocate = (lat: number, lng: number, label: string) => {
    const loc = { lat, lng, label };
    setLocation(loc);
    setCompared(false);
    setStores([]);
    // Save location for next time
    saveUserLocation(lat, lng, label);
  };

  const handleReplace = useCallback(async (storeKey: string, oldCode: string, newItem: ListItem, storePrice: number) => {
    // Apply replacement to ALL stores that are missing oldCode
    // For the triggering store: use the already-verified storePrice
    // For other stores: check if the substitute exists there too
    const currentStores = stores;
    const updatedStores = await Promise.all(
      currentStores.map(async (s) => {
        const missingItem = s.items.find(i => i.item_code === oldCode && !i.found);
        if (!missingItem) return s; // item not missing in this store — skip

        const quantity = missingItem.quantity;
        let price: number | null = null;

        if (s.store_key === storeKey) {
          // Triggering store — price already verified
          price = storePrice;
        } else {
          // Other stores — check if substitute exists there
          price = await checkItemInStore(s.chain_id, s.store_id, newItem.item_code);
        }

        const updatedItems = s.items.map(item => {
          if (item.item_code !== oldCode) return item;
          if (price !== null) {
            return {
              ...item,
              item_code: newItem.item_code,
              item_name: newItem.item_name,
              found: true,
              price,
              total: price * quantity,
            };
          }
          // Substitute not found in this store — update name but keep as missing
          return {
            ...item,
            item_code: newItem.item_code,
            item_name: newItem.item_name,
            found: false,
            price: null,
            total: null,
          };
        });

        const foundCount = updatedItems.filter(i => i.found).length;
        const total = updatedItems.reduce((sum, i) => sum + (i.total || 0), 0);
        return {
          ...s,
          items: updatedItems,
          products_found: foundCount,
          products_missing: updatedItems.length - foundCount,
          total_price: total,
        };
      })
    );

    setStores(updatedStores);
  }, [stores]);

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
                  <button onClick={() => { setLocation(null); setStores([]); setCompared(false); }} style={{ color: '#8a7f75', marginRight: 4 }}>
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
                {stores.map((store, idx) => (
                  <StoreCard
                    key={store.store_key}
                    store={store}
                    rank={idx + 1}
                    totalItems={currentItems.length}
                    onReplace={handleReplace}
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
