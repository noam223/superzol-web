'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Trash2, Check, Plus, Search, GitCompare, CheckSquare, Square, X, MapPin } from 'lucide-react';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import Link from 'next/link';
import toast from 'react-hot-toast';

const PRODUCTS_INDEX = 'products_index';

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

async function fetchProductIndex(itemCode: string): Promise<{ min_price?: number; max_price?: number } | null> {
  if (!itemCode || itemCode === 'group') return null;
  try {
    const params = new URLSearchParams({ collection: PRODUCTS_INDEX, doc_id: itemCode });
    const res = await fetch(`/api/search?${params}`);
    if (res.ok) return await res.json();
  } catch { /* skip */ }
  return null;
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

// ── Group bottom sheet ────────────────────────────────────────────────────────
function GroupSheet({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const [products, setProducts] = useState<GroupProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [nestedItem, setNestedItem] = useState<ListItem | null>(null);

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
        onClick={onClose}
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
  const isGroup = item.item_code === 'group';

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
        onClick={onClose}
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
                        <div className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(182,171,156,0.2)' }}>
                          <span className="text-xs font-bold" style={{ color: '#4F483F' }}>
                            {store.chain_name.slice(0, 2)}
                          </span>
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
function SwipeRow({
  item,
  multiSelect,
  isSelected,
  onToggle,
  onDelete,
  onUpdateQty,
  onToggleSelect,
  onPressStart,
  onPressEnd,
  onTap,
}: {
  item: ListItem;
  multiSelect: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateQty: (qty: number) => void;
  onToggleSelect: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onTap: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const touchHandled = useRef(false); // prevent click from double-firing after touch
  const rowRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = false;
    touchHandled.current = false;
    onPressStart();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 8) {
      isDragging.current = true;
      onPressEnd(); // cancel long-press if swiping
    }
    if (!isDragging.current) return;
    // Clamp: right swipe (positive) = check/toggle, left swipe (negative) = delete
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    onPressEnd();
    touchHandled.current = true;
    const wasDragging = isDragging.current;
    if (offsetX > SWIPE_THRESHOLD) {
      onToggle(); // swipe right → check/uncheck
    } else if (offsetX < -SWIPE_THRESHOLD) {
      onDelete(); // swipe left → delete
    } else if (!wasDragging && !multiSelect) {
      onTap(); // tap without swipe → open sheet
    }
    setOffsetX(0);
    startX.current = null;
    isDragging.current = false;
  };

  const handleClick = () => {
    // On touch devices, touchEnd already handled the tap — skip
    if (touchHandled.current) { touchHandled.current = false; return; }
    if (!multiSelect) onTap(); else onToggleSelect();
  };

  // Background color based on swipe direction (right=check/green, left=delete/red)
  const bgRight = offsetX > 20 ? `rgba(45,122,45,${Math.min(0.7, offsetX / SWIPE_MAX)})` : 'transparent';
  const bgLeft = offsetX < -20 ? `rgba(191,44,44,${Math.min(0.7, Math.abs(offsetX) / SWIPE_MAX)})` : 'transparent';

  return (
    <div
      className="relative"
      style={{ borderRadius: 16 }}
    >
      {/* Right action bg (check) — only rendered while swiping right */}
      {offsetX > 10 && (
        <div
          className="absolute inset-0 flex items-center justify-end overflow-hidden"
          style={{ background: bgRight, borderRadius: 16, paddingRight: 32 }}
        >
          <Check size={22} color="white" />
        </div>
      )}
      {/* Left action bg (delete) — only rendered while swiping left */}
      {offsetX < -10 && (
        <div
          className="absolute inset-0 flex items-center justify-start overflow-hidden"
          style={{ background: bgLeft, borderRadius: 16, paddingLeft: 32 }}
        >
          <Trash2 size={22} color="white" />
        </div>
      )}

      {/* Row content */}
      <div
        ref={rowRef}
        className="relative flex items-center gap-0 select-none"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 ? 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none',
          background: isSelected ? 'rgba(191,44,44,0.06)' : 'rgba(255,255,255,0.82)',
          borderRadius: 16,
          opacity: item.checked ? 0.6 : 1,
          boxShadow: '0 1px 4px rgba(79,72,63,0.07)',
          paddingBottom: 0,
          cursor: 'pointer',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onPointerDown={!('ontouchstart' in window) ? onPressStart : undefined}
        onPointerUp={!('ontouchstart' in window) ? onPressEnd : undefined}
        onPointerLeave={!('ontouchstart' in window) ? onPressEnd : undefined}
        onPointerCancel={!('ontouchstart' in window) ? onPressEnd : undefined}
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

        {/* ── PRODUCT IMAGE: contained square ── */}
        <div
          className="shrink-0 my-2"
          style={{
            width: 56, height: 56, borderRadius: 12,
            background: '#f5f0eb',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RowImage itemCode={item.item_code} name={item.item_name} groupId={item.group_id} />
        </div>

        {/* ── CENTER: name + subtitle ── */}
        <div
          className="flex-1 min-w-0 px-3 py-3"
          onClick={multiSelect ? (e => { e.stopPropagation(); onToggleSelect(); }) : undefined}
          style={multiSelect ? { cursor: 'pointer' } : undefined}
        >
          <p
            className="font-bold text-sm leading-snug"
            style={{
              color: '#3a342c',
              fontFamily: 'Heebo, sans-serif',
              textDecoration: item.checked ? 'line-through' : 'none',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.item_name}
          </p>
          {!multiSelect && (
            <div className="mt-1">
              <PriceRange itemCode={item.group_id ? (item.image_item_code ?? '') : item.item_code} />
            </div>
          )}
        </div>

        {/* ── LEFT SIDE: quantity stepper (horizontal row) ── */}
        {!multiSelect && !item.checked && (
          <div className="flex items-center shrink-0 pr-3 py-2" style={{ paddingLeft: 12 }}>
            <div
              className="flex items-center"
              style={{
                background: 'rgba(182,171,156,0.2)',
                borderRadius: 10,
                border: '1px solid rgba(182,171,156,0.4)',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={e => { e.stopPropagation(); onUpdateQty(item.quantity - 1); }}
                className="flex items-center justify-center font-bold"
                style={{ width: 26, height: 26, color: '#6b6259', fontSize: 15 }}
              >
                −
              </button>
              <span
                className="text-xs font-bold text-center"
                style={{ minWidth: 18, color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}
              >
                {item.quantity}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onUpdateQty(item.quantity + 1); }}
                className="flex items-center justify-center font-bold"
                style={{ width: 26, height: 26, color: '#6b6259', fontSize: 15 }}
              >
                +
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── TRASH: circle sitting on top-left corner edge (half in, half out) ── */}
      {!multiSelect && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute flex items-center justify-center z-10"
          style={{
            top: 0, left: 0,
            transform: 'translate(-50%, -50%)',
            width: 24, height: 24,
            borderRadius: '50%',
            background: '#BF2C2C',
            color: '#fff',
            boxShadow: '0 1px 4px rgba(191,44,44,0.35)',
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ShoppingListPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);

  // Multi-select state
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Long-press refs per item
  const pressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) loadItems(user.id);
      else setLoading(false);
    });
  }, []);

  const loadItems = async (userId: string) => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) setItems(data);
    setLoading(false);
  };

  const toggleItem = async (item: ListItem) => {
    if (multiSelect) { toggleSelect(item.id); return; }
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);
    if (!error) setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i));
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
    if (!error) { setItems(prev => prev.filter(i => i.id !== id)); toast.success('הוסר מהרשימה'); }
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    await supabase.from('shopping_list_items').update({ quantity }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
  };

  const clearChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id);
    if (checkedIds.length === 0) return;
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
    await supabase.from('shopping_list_items').delete().in('id', ids);
    setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
    toast.success(`הוסרו ${ids.length} פריטים`);
    exitMultiSelect();
  };

  const bulkCheck = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await supabase.from('shopping_list_items').update({ checked: true }).in('id', ids);
    setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, checked: true } : i));
    toast.success(`סומנו ${ids.length} פריטים`);
    exitMultiSelect();
  };

  const handlePressStart = (id: string) => {
    const timer = setTimeout(() => {
      pressTimers.current.delete(id);
      setMultiSelect(true);
      setSelectedIds(new Set([id]));
    }, LONG_PRESS_MS);
    pressTimers.current.set(id, timer);
  };

  const handlePressEnd = (id: string) => {
    const timer = pressTimers.current.get(id);
    if (timer) { clearTimeout(timer); pressTimers.current.delete(id); }
  };

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  if (!user) {
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
          <h1 className="text-xl font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
            רשימת קניות שלי
          </h1>
          {!multiSelect && checked.length > 0 && (
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
        {multiSelect && (
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

        {/* Add item button */}
        {!multiSelect && (
          <Link
            href="/search"
            className="flex items-center gap-3 p-4 rounded-2xl mb-5 transition-opacity hover:opacity-80"
            style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px dashed rgba(182,171,156,0.7)', color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}
          >
            <Plus size={18} style={{ color: '#BF2C2C' }} />
            <span className="font-medium text-sm">הוסף מוצר מהחיפוש</span>
            <Search size={14} className="mr-auto" />
          </Link>
        )}

        {loading ? (
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
                    onPressStart={() => handlePressStart(item.id)}
                    onPressEnd={() => handlePressEnd(item.id)}
                    onTap={() => item.group_id ? setSelectedGroup(item) : setSelectedItem(item)}
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
                    onPressStart={() => handlePressStart(item.id)}
                    onPressEnd={() => handlePressEnd(item.id)}
                    onTap={() => item.group_id ? setSelectedGroup(item) : setSelectedItem(item)}
                  />
                ))}
              </div>
            )}

            {/* Swipe hint */}
            {!multiSelect && items.length > 0 && (
              <p className="text-center text-xs mt-4" style={{ color: '#B6AB9C', fontFamily: 'Heebo, sans-serif' }}>
                החלק ימינה לסימון · החלק שמאלה למחיקה · לחיצה ממושכת לבחירה מרובה
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
