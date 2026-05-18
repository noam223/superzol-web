'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Trash2, Check, Plus, Search, GitCompare, CheckSquare, Square, X, MapPin, ArrowRight, Pencil } from 'lucide-react';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { getChainLogoUrl } from '@/lib/chainLogos';
import { getUserLocation } from '@/lib/location';
import { searchProductsIndex, IndexProduct, formatUnitInfo } from '@/lib/typesense';
import Link from 'next/link';
import toast from 'react-hot-toast';

const PRODUCTS_INDEX = 'products_index';

type StoreListItem = { item_code: string; item_name: string; quantity: number; price: number };
type StoreList = { store_name: string; items: StoreListItem[] };

const NAMED_LIST_ITEMS_PREFIX = 'superzol_named_list_items_';

function loadNamedListItems(listId: string): ListItem[] {
  try {
    const raw = localStorage.getItem(`${NAMED_LIST_ITEMS_PREFIX}${listId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveNamedListItems(listId: string, items: ListItem[]) {
  try { localStorage.setItem(`${NAMED_LIST_ITEMS_PREFIX}${listId}`, JSON.stringify(items)); } catch { /* ignore */ }
}

function getNamedListName(listId: string): string {
  try {
    const raw = localStorage.getItem('superzol_named_lists');
    if (raw) {
      const lists: { id: string; name: string }[] = JSON.parse(raw);
      return lists.find(l => l.id === listId)?.name ?? 'רשימה';
    }
  } catch { /* ignore */ }
  return 'רשימה';
}

type GroupProduct = {
  item_code: string;
  item_name: string;
};

type NearbyStore = {
  store_key: string;
  chain_name: string;
  store_name: string;
  distance_km: number;
  total_price: number;
};

async function fetchProductIndex(itemCode: string): Promise<{ min_price?: number; max_price?: number; unit_qty?: string; quantity?: number; unit_of_measure?: string } | null> {
  if (!itemCode || itemCode === 'group') return null;
  try {
    const params = new URLSearchParams({ collection: PRODUCTS_INDEX, doc_id: itemCode });
    const res = await fetch(`/api/search?${params}`);
    if (res.ok) return await res.json();
  } catch { /* skip */ }
  return null;
}

// Module-level cache for unit info per item_code
const _unitInfoCache: Record<string, string | null> = {};

async function getUnitInfo(itemCode: string): Promise<string | null> {
  if (!itemCode || itemCode === 'group') return null;
  if (itemCode in _unitInfoCache) return _unitInfoCache[itemCode];
  const p = await fetchProductIndex(itemCode);
  const info = p ? formatUnitInfo(p) : null;
  _unitInfoCache[itemCode] = info;
  return info;
}

async function fetchNearbyPrices(itemCode: string, itemName: string, lat: number, lng: number): Promise<NearbyStore[]> {
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius_km: 15, items: [{ item_code: itemCode, item_name: itemName, quantity: 1 }] }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.stores || []).filter((s: NearbyStore) => s.total_price > 0);
  } catch { return []; }
}

/**
 * Given a list of items and a user location, returns the set of item IDs
 * that are NOT available in any nearby store (within radius_km).
 */
async function findOutOfRangeItemIds(
  items: ListItem[],
  lat: number,
  lng: number,
  radius_km = 15,
): Promise<Set<string>> {
  // Only check non-group items with a real item_code
  const checkable = items.filter(i => i.item_code && i.item_code !== 'group');
  if (checkable.length === 0) return new Set();

  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        radius_km,
        items: checkable.map(i => ({ item_code: i.item_code, item_name: i.item_name, quantity: 1 })),
      }),
    });
    if (!res.ok) return new Set();
    const data = await res.json();

    // Build a set of item_codes that ARE found in at least one store
    const foundCodes = new Set<string>();
    for (const store of (data.stores || [])) {
      for (const it of (store.items || [])) {
        if (it.found) foundCodes.add(it.item_code);
      }
    }

    // Items not found in any store → out of range
    const outIds = new Set<string>();
    for (const item of checkable) {
      if (!foundCodes.has(item.item_code)) outIds.add(item.id);
    }
    return outIds;
  } catch {
    return new Set();
  }
}

type ListItem = {
  id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  checked: boolean;
  group_id?: string | null;
  image_item_code?: string | null;
};

const LONG_PRESS_MS = 500;
const SWIPE_THRESHOLD = 72; // px to trigger action
const SWIPE_MAX = 100;      // max drag distance

// ── Product image ─────────────────────────────────────────────────────────────
function ProductImage({ itemCode, name, size = 52 }: { itemCode: string; name: string; size?: number }) {
  const [src, setSrc] = useState(() => itemCode && itemCode !== 'group' ? getProductImageUrl(itemCode) : '');
  const [failed, setFailed] = useState(!itemCode || itemCode === 'group');

  const handleError = () => {
    if (itemCode && src === getProductImageUrl(itemCode)) {
      setSrc(getProductImageFallback(itemCode));
    } else {
      setFailed(true);
    }
  };

  if (failed || !itemCode || itemCode === 'group') {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: 12,
          background: 'linear-gradient(135deg, #f0e8e0, #e8ddd5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.42, flexShrink: 0,
        }}
      >
        {itemCode === 'group' ? '📦' : '🛒'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={name} onError={handleError}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 12, flexShrink: 0, background: '#f8f4f0' }}
    />
  );
}

// ── Row image + unit badge ────────────────────────────────────────────────────
function UnitBadge({ itemCode }: { itemCode: string }) {
  const [unit, setUnit] = useState<string | null>(null);
  useEffect(() => {
    getUnitInfo(itemCode).then(setUnit);
  }, [itemCode]);
  if (!unit) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: '#6b6259',
      background: 'rgba(182,171,156,0.28)', borderRadius: 4,
      padding: '1px 4px', maxWidth: 56, whiteSpace: 'nowrap',
      overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4,
      display: 'block', textAlign: 'center',
    }}>
      {unit}
    </span>
  );
}

// ── Row image (contained inside parent box) ───────────────────────────────────
function RowImage({ itemCode, name, groupId }: { itemCode: string; name: string; groupId?: string | null }) {
  const isGroup = itemCode === 'group';
  const [resolvedCode, setResolvedCode] = useState<string | null>(!isGroup ? itemCode : null);
  const [src, setSrc] = useState(() => !isGroup ? getProductImageUrl(itemCode) : '');
  const [failed, setFailed] = useState(isGroup && !groupId);

  useEffect(() => {
    if (isGroup && groupId && !resolvedCode) {
      supabase
        .from('product_groups')
        .select('image_item_code')
        .eq('id', groupId)
        .single()
        .then(({ data }) => {
          if (data?.image_item_code) {
            setResolvedCode(data.image_item_code);
            setSrc(getProductImageUrl(data.image_item_code));
            setFailed(false);
          } else {
            setFailed(true);
          }
        });
    }
  }, [isGroup, groupId, resolvedCode]);

  const handleError = () => {
    if (resolvedCode && src === getProductImageUrl(resolvedCode)) {
      setSrc(getProductImageFallback(resolvedCode));
    } else {
      setFailed(true);
    }
  };

  if (failed || (!resolvedCode && isGroup)) {
    return (
      <span style={{ fontSize: 28 }}>{isGroup ? '📦' : '🛒'}</span>
    );
  }

  if (!src) return <span style={{ fontSize: 28 }}>🛒</span>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={name} onError={handleError}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

// ── Price range badge ─────────────────────────────────────────────────────────
function PriceRange({ itemCode }: { itemCode: string }) {
  const [range, setRange] = useState<{ min: number; max?: number } | null>(null);

  useEffect(() => {
    if (!itemCode || itemCode === 'group') return;
    fetchProductIndex(itemCode).then(p => {
      if (p?.min_price) setRange({ min: p.min_price, max: p.max_price });
    });
  }, [itemCode]);

  if (!range) return null;
  const fmt = (n: number) => `₪${n.toFixed(2)}`;
  return (
    <span className="text-xs font-medium" style={{ color: '#2d7a2d' }}>
      {range.max && range.max > range.min + 0.01
        ? `${fmt(range.min)} – ${fmt(range.max)}`
        : fmt(range.min)}
    </span>
  );
}

// ── Group price range (min across all items in group, max across all items) ────
function GroupPriceRange({ groupId }: { groupId: string }) {
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    supabase
      .from('product_group_items')
      .select('item_code')
      .eq('group_id', groupId)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const prices = await Promise.all(
          data.map(({ item_code }: { item_code: string }) => fetchProductIndex(item_code))
        );
        const mins: number[] = [];
        const maxs: number[] = [];
        for (const p of prices) {
          if (p?.min_price) mins.push(p.min_price);
          if (p?.max_price) maxs.push(p.max_price);
          else if (p?.min_price) maxs.push(p.min_price);
        }
        if (mins.length > 0) {
          setRange({ min: Math.min(...mins), max: Math.max(...maxs) });
        }
      });
  }, [groupId]);

  if (!range) return null;
  const fmt = (n: number) => `₪${n.toFixed(2)}`;
  return (
    <span className="text-xs font-medium" style={{ color: '#2d7a2d' }}>
      {range.max > range.min + 0.01
        ? `${fmt(range.min)} – ${fmt(range.max)}`
        : fmt(range.min)}
    </span>
  );
}

// ── Group bottom sheet ────────────────────────────────────────────────────────
function GroupSheet({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const [products, setProducts] = useState<GroupProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [nestedItem, setNestedItem] = useState<ListItem | null>(null);
  const justOpened = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => { justOpened.current = false; }, 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!item.group_id) return;
    supabase
      .from('product_group_items')
      .select('item_code, item_name')
      .eq('group_id', item.group_id)
      .then(({ data }) => {
        setProducts((data as GroupProduct[]) || []);
        setLoading(false);
      });
  }, [item.group_id]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={() => { if (!justOpened.current) onClose(); }}
      />
      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background: '#EDE4DA',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          maxHeight: '85vh',
        }}
        dir="rtl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(79,72,63,0.25)' }} />
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(79,72,63,0.1)', color: '#4F483F' }}
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 shrink-0">
          <h2 className="text-lg font-bold text-center" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
            {item.item_name}
          </h2>
          <p className="text-xs text-center mt-0.5" style={{ color: '#B6AB9C' }}>בחר מוצר לפרטים ומחירים</p>
        </div>

        {/* Scrollable product list */}
        <div className="overflow-y-auto flex-1 px-4 pb-8 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#B6AB9C' }}>אין מוצרים בקבוצה</p>
          ) : (
            products.map(p => (
              <button
                key={p.item_code}
                className="flex items-center gap-3 w-full text-right"
                style={{
                  background: 'rgba(255,255,255,0.82)',
                  borderRadius: 16,
                  padding: '10px 14px',
                  boxShadow: '0 1px 4px rgba(79,72,63,0.07)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setNestedItem({
                  id: p.item_code,
                  item_code: p.item_code,
                  item_name: p.item_name,
                  quantity: 1,
                  checked: false,
                  group_id: null,
                })}
              >
                {/* Image */}
                <div style={{ width: 52, height: 52, borderRadius: 12, background: '#f5f0eb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ProductImage itemCode={p.item_code} name={p.item_name} size={52} />
                </div>
                {/* Name + price */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
                    {p.item_name}
                  </p>
                  <div className="mt-0.5">
                    <PriceRange itemCode={p.item_code} />
                  </div>
                </div>
                {/* Chevron */}
                <span style={{ color: '#B6AB9C', fontSize: 18, flexShrink: 0 }}>›</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Nested ProductSheet */}
      {nestedItem && (
        <ProductSheet item={nestedItem} onClose={() => setNestedItem(null)} />
      )}
    </>
  );
}

// ── Product bottom sheet ──────────────────────────────────────────────────────
function ProductSheet({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [range, setRange] = useState<{ min: number; max?: number } | null>(null);
  const justOpened = useRef(true);
  const isGroup = item.item_code === 'group';

  useEffect(() => {
    const t = setTimeout(() => { justOpened.current = false; }, 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isGroup) {
      fetchProductIndex(item.item_code).then(p => {
        if (p?.min_price) setRange({ min: p.min_price, max: p.max_price });
      });
    }
  }, [item.item_code, isGroup]);

  useEffect(() => {
    if (isGroup) return;
    setLoadingStores(true);
    navigator.geolocation?.getCurrentPosition(
      pos => {
        fetchNearbyPrices(item.item_code, item.item_name, pos.coords.latitude, pos.coords.longitude)
          .then(s => { setStores(s); setLoadingStores(false); });
      },
      () => setLoadingStores(false),
      { timeout: 8000 }
    );
  }, [item.item_code, item.item_name, isGroup]);

  const fmt = (n: number) => `₪${n.toFixed(2)}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={() => { if (!justOpened.current) onClose(); }}
      />
      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background: '#EDE4DA',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          maxHeight: '85vh',
        }}
        dir="rtl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(79,72,63,0.25)' }} />
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(79,72,63,0.1)', color: '#4F483F' }}
        >
          <X size={16} />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pb-8">
          {/* Product image */}
          <div className="flex justify-center my-4">
            <div style={{ width: 120, height: 120, borderRadius: 20, background: '#f5f0eb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RowImage itemCode={item.item_code} name={item.item_name} groupId={item.group_id} />
            </div>
          </div>

          {/* Product name */}
          <h2 className="text-lg font-bold text-center mb-2" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
            {item.item_name}
          </h2>

          {/* Price range */}
          {range && (
            <div className="flex justify-center mb-4">
              <div className="px-4 py-2 rounded-2xl" style={{ background: 'rgba(45,122,45,0.1)' }}>
                <span className="text-base font-bold" style={{ color: '#2d7a2d' }}>
                  {range.max && range.max > range.min + 0.01
                    ? `${fmt(range.min)} – ${fmt(range.max)}`
                    : fmt(range.min)}
                </span>
              </div>
            </div>
          )}

          {/* Compare link for groups */}
          {item.group_id && (
            <div className="flex justify-center mb-4">
              <Link
                href={`/compare?group=${item.group_id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold"
                style={{ background: '#BF2C2C', color: 'white' }}
                onClick={onClose}
              >
                <GitCompare size={14} />
                השווה מחירים בחנויות
              </Link>
            </div>
          )}

          {/* Nearby stores */}
          {!isGroup && (
            <div>
              <h3 className="text-sm font-bold mb-3" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                מחירים בחנויות קרובות
              </h3>
              {loadingStores ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
                </div>
              ) : stores.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: '#B6AB9C' }}>
                  {loadingStores ? '' : 'לא נמצאו חנויות קרובות'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stores.slice(0, 10).map((store, i) => (
                    <div
                      key={store.store_key}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl"
                      style={{
                        background: i === 0 ? 'rgba(45,122,45,0.08)' : 'rgba(255,255,255,0.7)',
                        border: i === 0 ? '1.5px solid rgba(45,122,45,0.2)' : '1px solid rgba(182,171,156,0.3)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: '1px solid rgba(182,171,156,0.25)', overflow: 'hidden' }}>
                          {getChainLogoUrl(store.chain_name) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={getChainLogoUrl(store.chain_name)!} alt={store.chain_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span className="text-xs font-bold" style={{ color: '#4F483F' }}>{store.chain_name.slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: '#3a342c' }}>{store.store_name}</p>
                          <p className="text-xs flex items-center gap-1" style={{ color: '#B6AB9C' }}>
                            <MapPin size={9} />
                            {store.distance_km < 1
                              ? `${Math.round(store.distance_km * 1000)} מ׳`
                              : `${store.distance_km.toFixed(1)} ק״מ`}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-base shrink-0" style={{ color: i === 0 ? '#2d7a2d' : '#3a342c' }}>
                        {fmt(store.total_price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Swipeable row ─────────────────────────────────────────────────────────────
// ── SwipeRow: native scroll-snap swipe ────────────────────────────────────────
// Uses a horizontally scrollable container with scroll-snap so the browser
// handles both X and Y axes natively — zero JS touch handling, zero conflicts.
// SwipeRow: action panels are position:absolute behind main content.
// Main content slides with translateX on touch drag.
// Swipe right → check/toggle | Swipe left → delete
const ACTION_WIDTH = 80; // px — width of each action panel

function SwipeRow({
  item,
  multiSelect,
  isSelected,
  onToggle,
  onDelete,
  onUpdateQty,
  onToggleSelect,
  onTap,
  outOfRange,
  isScrollingRef,
}: {
  item: ListItem;
  multiSelect: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateQty: (qty: number) => void;
  onToggleSelect: () => void;
  onTap: () => void;
  outOfRange?: boolean;
  isScrollingRef: React.RefObject<boolean>;
}) {
  const actionFiredRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const directionRef = useRef<'h' | 'v' | null>(null);
  const didMoveRef = useRef(false);
  const tapOnTextRef = useRef(false); // true only when touch started on the text/center area
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const THRESHOLD = ACTION_WIDTH * 0.45;

  const resetPosition = useCallback((animate = true) => {
    setTranslateX(0);
    actionFiredRef.current = false;
  }, []);

  // Swipe detection (no long-press)
  const handleTouchStart = (e: React.TouchEvent, fromTextArea = false) => {
    if (isScrollingRef.current) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    directionRef.current = null;
    didMoveRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
    tapOnTextRef.current = fromTextArea;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    const adx = Math.abs(dx);

    if (directionRef.current === null && (adx > 5 || dy > 5)) {
      directionRef.current = adx > dy ? 'h' : 'v';
    }

    if (adx > 5 || dy > 5) {
      didMoveRef.current = true;
    }

    if (directionRef.current === 'h') {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      // Clamp: max ACTION_WIDTH in each direction, with resistance beyond threshold
      const clamped = Math.max(-ACTION_WIDTH * 1.2, Math.min(ACTION_WIDTH * 1.2, dx));
      setTranslateX(clamped);
    }
  };

  const handleTouchEnd = () => {
    if (isDraggingRef.current) {
      // Decide action based on how far swiped
      if (translateX > THRESHOLD) {
        // Swiped right → check/toggle (RTL: right = check)
        if (!actionFiredRef.current) {
          actionFiredRef.current = true;
          onToggle();
        }
        resetPosition();
      } else if (translateX < -THRESHOLD) {
        // Swiped left → delete (RTL: left = delete)
        if (!actionFiredRef.current) {
          actionFiredRef.current = true;
          onDelete();
        }
        resetPosition();
      } else {
        resetPosition();
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    } else if (!didMoveRef.current && !multiSelect) {
      if (tapOnTextRef.current) onTap();
    } else if (!didMoveRef.current && multiSelect) {
      onToggleSelect();
    }
  };

  const rowContent = (
    <div
      className="flex items-center gap-0 select-none"
      style={{
        background: isSelected ? 'rgba(191,44,44,0.06)' : outOfRange ? 'rgba(220,215,210,0.7)' : 'rgba(255,255,255,0.82)',
        borderRadius: 16,
        opacity: item.checked ? 0.6 : outOfRange ? 0.65 : 1,
        boxShadow: '0 1px 4px rgba(79,72,63,0.07)',
        minWidth: '100%',
        cursor: 'pointer',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (multiSelect) onToggleSelect();
      }}
    >
      {/* ── RIGHT SIDE: checkbox ── */}
      <div className="flex items-center justify-center shrink-0" style={{ width: 44, alignSelf: 'stretch' }}>
        {multiSelect ? (
          <button onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
            {isSelected
              ? <CheckSquare size={20} style={{ color: '#BF2C2C' }} />
              : <Square size={20} style={{ color: '#C4BAB0' }} />}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            onTouchStart={e => { e.stopPropagation(); }}
            className="flex items-center justify-center transition-all"
            style={{
              width: 24, height: 24, borderRadius: '50%',
              border: item.checked ? 'none' : '2px solid #C4BAB0',
              background: item.checked ? '#2d7a2d' : 'transparent',
              flexShrink: 0,
            }}
          >
            {item.checked && <Check size={12} color="white" />}
          </button>
        )}
      </div>

      {/* ── PRODUCT IMAGE + unit badge ── */}
      <div
        className="shrink-0 my-2 flex flex-col items-center gap-0.5"
        style={{ width: 56 }}
        onTouchStart={e => e.stopPropagation()}
      >
        <div style={{ width: 56, height: 56, borderRadius: 12, background: '#f5f0eb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RowImage itemCode={item.item_code} name={item.item_name} groupId={item.group_id} />
        </div>
        {item.item_code && item.item_code !== 'group' && (
          <UnitBadge itemCode={item.item_code} />
        )}
      </div>

      {/* ── CENTER: name + subtitle — tap/click here opens BottomSheet ── */}
      <div className="flex-1 min-w-0 px-3 py-3"
        onTouchStart={e => handleTouchStart(e, true)}
        onClick={() => { if (!multiSelect && !isDragging) onTap(); }}
      >
        {item.item_code && item.item_code !== 'group' ? (
          <Link href={`/product/${item.item_code}`} onClick={e => e.stopPropagation()}>
            <p
              className="font-bold text-sm leading-snug"
              style={{
                color: '#3a342c', fontFamily: 'Heebo, sans-serif',
                textDecoration: item.checked ? 'line-through' : 'none',
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {item.item_name}
            </p>
          </Link>
        ) : (
          <p
            className="font-bold text-sm leading-snug"
            style={{
              color: '#3a342c', fontFamily: 'Heebo, sans-serif',
              textDecoration: item.checked ? 'line-through' : 'none',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {item.item_name}
          </p>
        )}
        {!multiSelect && (
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {outOfRange ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(182,171,156,0.25)', color: '#8a7f75', fontSize: 10 }}>
                <MapPin size={9} />מוצר לא בטווח הקנייה
              </span>
            ) : item.group_id ? (
              <>
                <span className="inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C', fontSize: 10 }}>
                  ✦ מוצר חכם
                </span>
                <GroupPriceRange groupId={item.group_id} />
              </>
            ) : (
              <PriceRange itemCode={item.item_code} />
            )}
          </div>
        )}
      </div>

      {/* ── LEFT SIDE: quantity stepper ── */}
      {!multiSelect && !item.checked && (
        <div className="flex items-center shrink-0 pr-3 py-2" style={{ paddingLeft: 12 }}>
          <div className="flex items-center"
            style={{ background: 'rgba(182,171,156,0.2)', borderRadius: 10, border: '1px solid rgba(182,171,156,0.4)', overflow: 'hidden' }}>
            <button onClick={e => { e.stopPropagation(); onUpdateQty(item.quantity - 1); }}
              className="flex items-center justify-center font-bold"
              style={{ width: 26, height: 26, color: '#6b6259', fontSize: 15 }}>−</button>
            <span className="text-xs font-bold text-center"
              style={{ minWidth: 18, color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
              {item.quantity}
            </span>
            <button onClick={e => { e.stopPropagation(); onUpdateQty(item.quantity + 1); }}
              className="flex items-center justify-center font-bold"
              style={{ width: 26, height: 26, color: '#6b6259', fontSize: 15 }}>+</button>
          </div>
        </div>
      )}
    </div>
  );

  // Compute tint progress (0→1) for each direction
  const rightProgress = translateX > 0 ? Math.min(translateX / ACTION_WIDTH, 1) : 0;
  const leftProgress = translateX < 0 ? Math.min(-translateX / ACTION_WIDTH, 1) : 0;

  return (
    <div className="relative" style={{ borderRadius: 16 }}>
      {/* Inner clip wrapper — clips action panels + sliding content, but NOT the trash button */}
      <div style={{ borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
        {/* LEFT action panel — full width, revealed when swiping RIGHT */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            paddingLeft: 20,
            background: `rgba(45,122,45,${0.75 + rightProgress * 0.2})`,
            opacity: rightProgress,
            pointerEvents: 'none',
            transition: isDragging ? 'none' : 'opacity 0.2s ease',
          }}
        >
          <Check size={28} color="white" strokeWidth={3} />
        </div>

        {/* RIGHT action panel — full width, revealed when swiping LEFT */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            paddingRight: 20,
            background: `rgba(191,44,44,${0.75 + leftProgress * 0.2})`,
            opacity: leftProgress,
            pointerEvents: 'none',
            transition: isDragging ? 'none' : 'opacity 0.2s ease',
          }}
        >
          <Trash2 size={28} color="white" strokeWidth={2.5} />
        </div>

        {/* MAIN content — slides with touch, tinted during drag */}
        <div
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease',
            borderRadius: 16,
            position: 'relative',
            zIndex: 1,
            // Color tint overlay via box-shadow inset
            boxShadow: rightProgress > 0
              ? `inset 0 0 0 9999px rgba(45,122,45,${rightProgress * 0.18})`
              : leftProgress > 0
              ? `inset 0 0 0 9999px rgba(191,44,44,${leftProgress * 0.18})`
              : 'none',
          }}
        >
          {rowContent}
        </div>
      </div>

      {/* ── TRASH button: absolute circle on top-left corner — outside clip wrapper so it floats ── */}
      {!multiSelect && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute flex items-center justify-center z-10"
          style={{
            top: 0, left: 0,
            transform: 'translate(-50%, -50%)',
            width: 24, height: 24,
            borderRadius: '50%',
            background: '#BF2C2C', color: '#fff',
            boxShadow: '0 1px 4px rgba(191,44,44,0.35)',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ── Store list view (read-only, from sessionStorage) ─────────────────────────
function StoreListView({ storeName }: { storeName: string }) {
  const [storeList, setStoreList] = useState<StoreList | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('superzol_store_lists');
      if (raw) {
        const lists: StoreList[] = JSON.parse(raw);
        const found = lists.find(l => l.store_name === storeName);
        setStoreList(found || null);
      }
    } catch { /* ignore */ }
  }, [storeName]);

  if (!storeList) {
    return (
      <div className="text-center py-16" style={{ color: '#8a7f75' }}>
        <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">הרשימה לא נמצאה</p>
      </div>
    );
  }

  const total = storeList.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const fmt = (n: number) => `₪${n.toFixed(2)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl" style={{ background: 'rgba(45,122,45,0.1)', border: '1.5px solid rgba(45,122,45,0.2)' }}>
        <span className="text-sm font-bold" style={{ color: '#2d7a2d', fontFamily: 'Heebo, sans-serif' }}>סה״כ</span>
        <span className="text-lg font-bold" style={{ color: '#2d7a2d' }}>{fmt(total)}</span>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
        {storeList.items.map((item, idx) => (
          <div key={`${item.item_code}-${idx}`} className="flex items-center gap-3 px-4 py-3"
            style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(182,171,156,0.25)' }}>
            <ProductImage itemCode={item.item_code} name={item.item_name} size={44} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>{item.item_name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>×{item.quantity} · {fmt(item.price)} ליח׳</p>
            </div>
            <span className="text-sm font-bold shrink-0" style={{ color: '#4F483F' }}>{fmt(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-xs mt-2" style={{ color: '#B6AB9C', fontFamily: 'Heebo, sans-serif' }}>
        רשימה זו נשמרה מהשוואת מחירים ואינה ניתנת לעריכה
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ShoppingListDetailPage() {
  const params = useParams();
  const listId = typeof params.listId === 'string' ? params.listId : '';
  const isStoreList = listId.startsWith('store-');
  const isNamedList = listId.startsWith('named-');
  const namedListId = isNamedList ? listId.slice('named-'.length) : '';
  const storeName = isStoreList ? decodeURIComponent(listId.slice('store-'.length)) : '';
  const namedListName = isNamedList ? getNamedListName(namedListId) : '';

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [outOfRangeIds, setOutOfRangeIds] = useState<Set<string>>(new Set());

  // Multi-select state
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndexProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allGroups, setAllGroups] = useState<{ id: string; name: string; image_item_code: string | null }[]>([]);
  const [matchingGroups, setMatchingGroups] = useState<{ id: string; name: string; image_item_code: string | null }[]>([]);

  // Long-press refs per item
  const pressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Scroll state
  const isScrollingRef = useRef<boolean>(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => { isScrollingRef.current = false; }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, []);

  useEffect(() => {
    if (isNamedList) {
      // Load from localStorage
      const saved = loadNamedListItems(namedListId);
      setItems(saved);
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user && !isStoreList) loadItems(user.id);
      else setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStoreList, isNamedList, namedListId]);

  const loadItems = async (userId: string) => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) setItems(data);
    setLoading(false);
  };

  // Helper: persist named list items to localStorage
  const persistNamedItems = useCallback((updated: ListItem[]) => {
    if (isNamedList) saveNamedListItems(namedListId, updated);
  }, [isNamedList, namedListId]);

  // Load all groups once on mount (for inline search)
  useEffect(() => {
    if (isStoreList) return;
    supabase.from('product_groups').select('id, name, image_item_code').then(({ data }) => {
      if (data) setAllGroups(data as { id: string; name: string; image_item_code: string | null }[]);
    });
  }, [isStoreList]);

  // Inline search debounce — products + groups
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); setMatchingGroups([]); return; }
    const qLower = searchQuery.toLowerCase();
    setMatchingGroups(allGroups.filter(g =>
      g.name.toLowerCase().includes(qLower) ||
      qLower.split(/\s+/).some(w => w.length >= 2 && g.name.includes(w))
    ).slice(0, 3));
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { hits } = await searchProductsIndex(searchQuery, { perPage: 6 });
        setSearchResults(hits);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, allGroups]);

  // Add a group to the current list
  const addGroupToList = useCallback(async (group: { id: string; name: string }) => {
    if (isNamedList) {
      const newItem: ListItem = {
        id: crypto.randomUUID(),
        item_code: 'group',
        item_name: group.name,
        quantity: 1,
        checked: false,
        group_id: group.id,
      };
      setItems(prev => { const u = [newItem, ...prev]; persistNamedItems(u); return u; });
      toast.success(`📦 ${group.name} נוסף`);
    } else {
      if (!user) { toast.error('התחבר כדי לשמור לרשימה'); return; }
      const { data, error } = await supabase.from('shopping_list_items').insert({
        user_id: user.id,
        item_code: 'group',
        item_name: group.name,
        quantity: 1,
        checked: false,
        group_id: group.id,
      }).select().single();
      if (error) { toast.error('שגיאה בהוספה'); return; }
      setItems(prev => [data as ListItem, ...prev]);
      toast.success(`📦 ${group.name} נוסף`);
    }
    setSearchQuery('');
    setSearchResults([]);
    setMatchingGroups([]);
  }, [isNamedList, user, persistNamedItems]);

  // Add a product to the current list
  const addItemToList = useCallback(async (product: IndexProduct) => {
    if (isNamedList) {
      const newItem: ListItem = {
        id: crypto.randomUUID(),
        item_code: product.item_code,
        item_name: product.item_name,
        quantity: 1,
        checked: false,
        group_id: null,
      };
      setItems(prev => { const u = [newItem, ...prev]; persistNamedItems(u); return u; });
      toast.success(`${product.item_name} נוסף`);
    } else {
      if (!user) { toast.error('התחבר כדי לשמור לרשימה'); return; }
      const { data, error } = await supabase.from('shopping_list_items').insert({
        user_id: user.id,
        item_code: product.item_code,
        item_name: product.item_name,
        quantity: 1,
        checked: false,
      }).select().single();
      if (error) { toast.error('שגיאה בהוספה'); return; }
      setItems(prev => [data as ListItem, ...prev]);
      toast.success(`${product.item_name} נוסף`);
    }
    setSearchQuery('');
    setSearchResults([]);
  }, [isNamedList, user, persistNamedItems]);

  const checkRangeForItems = useCallback(async (itemList: ListItem[]) => {
    const loc = await getUserLocation();
    if (!loc) return; // No location saved → skip check
    const outIds = await findOutOfRangeItemIds(itemList, loc.lat, loc.lng);
    setOutOfRangeIds(outIds);
  }, []);

  // Only re-check range when the set of item_codes changes (not on check/qty updates)
  const itemCodesKey = useMemo(
    () => items.map(i => i.item_code).sort().join(','),
    [items],
  );
  useEffect(() => {
    if (items.length > 0) checkRangeForItems(items);
    else setOutOfRangeIds(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCodesKey, checkRangeForItems]);

  const toggleItem = async (item: ListItem) => {
    if (multiSelect) { toggleSelect(item.id); return; }
    if (isNamedList) {
      setItems(prev => { const u = prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i); persistNamedItems(u); return u; });
      return;
    }
    const { error } = await supabase.from('shopping_list_items').update({ checked: !item.checked }).eq('id', item.id);
    if (!error) setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i));
  };

  const deleteItem = async (id: string) => {
    if (isNamedList) {
      setItems(prev => { const u = prev.filter(i => i.id !== id); persistNamedItems(u); return u; });
      toast.success('הוסר מהרשימה');
      return;
    }
    const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
    if (!error) { setItems(prev => prev.filter(i => i.id !== id)); toast.success('הוסר מהרשימה'); }
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    if (isNamedList) {
      setItems(prev => { const u = prev.map(i => i.id === id ? { ...i, quantity } : i); persistNamedItems(u); return u; });
      return;
    }
    await supabase.from('shopping_list_items').update({ quantity }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
  };

  const clearChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id);
    if (checkedIds.length === 0) return;
    if (isNamedList) {
      setItems(prev => { const u = prev.filter(i => !i.checked); persistNamedItems(u); return u; });
      toast.success(`הוסרו ${checkedIds.length} פריטים`);
      return;
    }
    await supabase.from('shopping_list_items').delete().in('id', checkedIds);
    setItems(prev => prev.filter(i => !i.checked));
    toast.success(`הוסרו ${checkedIds.length} פריטים`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const exitMultiSelect = useCallback(() => { setMultiSelect(false); setSelectedIds(new Set()); }, []);

  const selectAll = () => setSelectedIds(new Set(items.map(i => i.id)));

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (isNamedList) {
      setItems(prev => { const u = prev.filter(i => !selectedIds.has(i.id)); persistNamedItems(u); return u; });
    } else {
      await supabase.from('shopping_list_items').delete().in('id', ids);
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    }
    toast.success(`הוסרו ${ids.length} פריטים`);
    exitMultiSelect();
  };

  const bulkCheck = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (isNamedList) {
      setItems(prev => { const u = prev.map(i => selectedIds.has(i.id) ? { ...i, checked: true } : i); persistNamedItems(u); return u; });
    } else {
      await supabase.from('shopping_list_items').update({ checked: true }).in('id', ids);
      setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, checked: true } : i));
    }
    toast.success(`סומנו ${ids.length} פריטים`);
    exitMultiSelect();
  };

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  if (!user && !isStoreList && !isNamedList) {
    return (
      <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ShoppingCart size={64} className="mx-auto mb-4" style={{ color: '#B6AB9C' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>רשימת הקניות שלך</h2>
          <p className="mb-6 text-sm" style={{ color: '#8a7f75' }}>התחבר כדי לשמור ולנהל את רשימת הקניות שלך</p>
          <Link href="/login" className="inline-block px-6 py-3 rounded-2xl font-bold text-sm" style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}>
            התחבר
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link href="/shopping-list" className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: 'rgba(182,171,156,0.25)', color: '#4F483F' }}>
              <ArrowRight size={18} />
            </Link>
            <h1 className="text-xl font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
              {isStoreList ? storeName : isNamedList ? namedListName : 'רשימת קניות שלי'}
            </h1>
          </div>
          {/* "מחק מסומנים" stays in header only when there are checked items */}
          {!isStoreList && !multiSelect && checked.length > 0 && (
            <button
              onClick={clearChecked}
              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}
            >
              <Trash2 size={12} />
              מחק מסומנים ({checked.length})
            </button>
          )}
        </div>

        {/* Multi-select action bar */}
        {!isStoreList && multiSelect && (
          <div
            className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl mb-4"
            style={{ background: 'rgba(191,44,44,0.1)', border: '1.5px solid rgba(191,44,44,0.25)', fontFamily: 'Heebo, sans-serif' }}
          >
            <div className="flex items-center gap-2">
              <button onClick={exitMultiSelect} className="text-xs px-2.5 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(182,171,156,0.3)', color: '#4F483F' }}>ביטול</button>
              <span className="text-sm font-semibold" style={{ color: '#4F483F' }}>{selectedIds.size} נבחרו</span>
              <button onClick={selectAll} className="text-xs px-2.5 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(182,171,156,0.3)', color: '#4F483F' }}>בחר הכל</button>
            </div>
            <div className="flex gap-2">
              <button onClick={bulkCheck} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold disabled:opacity-40" style={{ background: '#2d7a2d', color: 'white' }}>
                <Check size={13} />סמן
              </button>
              <button onClick={bulkDelete} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold disabled:opacity-40" style={{ background: '#BF2C2C', color: 'white' }}>
                <Trash2 size={13} />מחק
              </button>
            </div>
          </div>
        )}

        {/* Action bar: עריכה + נקה רשימה — right side (RTL = justify-start), below search */}
        {!isStoreList && !multiSelect && items.length > 0 && (
          <div className="flex justify-start gap-2 mb-2">
            <button
              onClick={() => setMultiSelect(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: 'rgba(182,171,156,0.25)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
            >
              <Pencil size={12} />
              עריכה
            </button>
            <button
              onClick={async () => {
                if (!confirm('למחוק את כל המוצרים מהרשימה?')) return;
                if (isNamedList) {
                  saveNamedListItems(namedListId, []);
                  setItems([]);
                  toast.success('הרשימה נוקתה');
                } else if (user) {
                  const { error } = await supabase.from('shopping_list_items').delete().eq('user_id', user.id);
                  if (!error) { setItems([]); toast.success('הרשימה נוקתה'); }
                  else toast.error('שגיאה במחיקה');
                }
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: 'rgba(191,44,44,0.08)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif', border: '1px solid rgba(191,44,44,0.2)' }}
            >
              <Trash2 size={12} />
              נקה רשימה
            </button>
          </div>
        )}

        {/* Inline search bar */}
        {!isStoreList && !multiSelect && (
          <div className="relative mb-5" dir="rtl">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px solid rgba(182,171,156,0.5)', fontFamily: 'Heebo, sans-serif' }}>
              <Search size={16} style={{ color: '#BF2C2C', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="חפש מוצר להוספה..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
              />
              {searchLoading && (
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
              )}
              {searchQuery && !searchLoading && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ color: '#8a7f75' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            {(matchingGroups.length > 0 || searchResults.length > 0) && (
              <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-2xl overflow-hidden shadow-lg" style={{ background: 'rgba(248,244,240,0.98)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
                {/* Groups first */}
                {matchingGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => addGroupToList(group)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-red-50 active:bg-red-100"
                    style={{ borderBottom: '1px solid rgba(182,171,156,0.2)', fontFamily: 'Heebo, sans-serif', background: 'rgba(191,44,44,0.04)' }}
                  >
                    <img
                      src={group.image_item_code ? getProductImageUrl(group.image_item_code) : ''}
                      alt={group.name}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      className="w-10 h-10 rounded-xl object-contain shrink-0"
                      style={{ background: '#f0e8e0' }}
                    />
                    <div className="flex flex-col flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(191,44,44,0.15)', color: '#BF2C2C' }}>📦 קבוצה</span>
                      </div>
                      <span className="text-sm font-medium truncate" style={{ color: '#4F483F' }}>{group.name}</span>
                    </div>
                    <Plus size={16} style={{ color: '#BF2C2C', flexShrink: 0 }} />
                  </button>
                ))}
                {/* Products */}
                {searchResults.map(product => {
                  const unitInfo = formatUnitInfo(product);
                  return (
                    <button
                      key={product.item_code}
                      onClick={() => addItemToList(product)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-amber-50 active:bg-amber-100"
                      style={{ borderBottom: '1px solid rgba(182,171,156,0.2)', fontFamily: 'Heebo, sans-serif' }}
                    >
                      {/* Image + unit badge */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <img
                          src={getProductImageUrl(product.item_code)}
                          alt={product.item_name}
                          onError={e => { (e.target as HTMLImageElement).src = getProductImageFallback(product.item_code); }}
                          className="w-10 h-10 rounded-xl object-contain"
                          style={{ background: '#f0e8e0' }}
                        />
                        {unitInfo && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#6b6259', background: 'rgba(182,171,156,0.28)', borderRadius: 4, padding: '1px 3px', maxWidth: 40, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
                            {unitInfo}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 text-right">
                        <span className="text-sm font-medium truncate" style={{ color: '#4F483F' }}>{product.item_name}</span>
                        {product.manufacturer_name && <span className="text-xs truncate" style={{ color: '#8a7f75' }}>{product.manufacturer_name}</span>}
                      </div>
                      <Plus size={16} style={{ color: '#BF2C2C', flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isStoreList ? (
          <StoreListView storeName={storeName} />
        ) : loading ? (
          <div className="flex flex-col items-center py-16 gap-3" style={{ color: '#8a7f75' }}>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
            <span className="text-sm">טוען...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">הרשימה ריקה</p>
            <p className="text-sm mt-1">חפש מוצרים והוסף אותם לרשימה</p>
          </div>
        ) : (
          <>
            {/* Unchecked items */}
            {unchecked.length > 0 && (
              <div
                className="rounded-2xl p-3 mb-4 flex flex-col gap-3"
                style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.4)', overflow: 'visible', paddingTop: 16 }}
              >
                {unchecked.map(item => (
                  <SwipeRow
                    key={item.id}
                    item={item}
                    multiSelect={multiSelect}
                    isSelected={selectedIds.has(item.id)}
                    onToggle={() => toggleItem(item)}
                    onDelete={() => deleteItem(item.id)}
                    onUpdateQty={(qty) => updateQuantity(item.id, qty)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onTap={() => item.group_id ? setSelectedGroup(item) : setSelectedItem(item)}
                    outOfRange={outOfRangeIds.has(item.id)}
                    isScrollingRef={isScrollingRef}
                  />
                ))}
              </div>
            )}

            {/* Checked items */}
            {checked.length > 0 && (
              <div
                className="rounded-2xl p-3 flex flex-col gap-3 opacity-65"
                style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px solid rgba(182,171,156,0.3)', overflow: 'visible', paddingTop: 16 }}
              >
                <p className="text-xs font-medium px-1 mb-1" style={{ color: '#8a7f75' }}>נרכשו ({checked.length})</p>
                {checked.map(item => (
                  <SwipeRow
                    key={item.id}
                    item={item}
                    multiSelect={multiSelect}
                    isSelected={selectedIds.has(item.id)}
                    onToggle={() => toggleItem(item)}
                    onDelete={() => deleteItem(item.id)}
                    onUpdateQty={(qty) => updateQuantity(item.id, qty)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onTap={() => item.group_id ? setSelectedGroup(item) : setSelectedItem(item)}
                    outOfRange={outOfRangeIds.has(item.id)}
                    isScrollingRef={isScrollingRef}
                  />
                ))}
              </div>
            )}

            {/* Swipe hint */}
            {!multiSelect && items.length > 0 && (
              <p className="text-center text-xs mt-4" style={{ color: '#B6AB9C', fontFamily: 'Heebo, sans-serif' }}>
                החלק ימינה לסימון · החלק שמאלה למחיקה
              </p>
            )}
          </>
        )}
      </div>
      {selectedItem && <ProductSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
      {selectedGroup && <GroupSheet item={selectedGroup} onClose={() => setSelectedGroup(null)} />}
    </div>
  );
}
