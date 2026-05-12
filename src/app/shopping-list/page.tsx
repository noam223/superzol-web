'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Trash2, Check, Plus, Search, GitCompare, CheckSquare, Square } from 'lucide-react';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import Link from 'next/link';
import toast from 'react-hot-toast';

type ListItem = {
  id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  checked: boolean;
  group_id?: string | null;
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
function RowImage({ itemCode, name }: { itemCode: string; name: string }) {
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
      <span style={{ fontSize: 28 }}>{itemCode === 'group' ? '📦' : '🛒'}</span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={name} onError={handleError}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
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
}) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = false;
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
    if (offsetX > SWIPE_THRESHOLD) {
      onToggle(); // swipe right → check/uncheck
    } else if (offsetX < -SWIPE_THRESHOLD) {
      onDelete(); // swipe left → delete
    }
    setOffsetX(0);
    startX.current = null;
    isDragging.current = false;
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
          className="absolute inset-0 flex items-center justify-end pr-5 overflow-hidden"
          style={{ background: bgRight, borderRadius: 16 }}
        >
          <Check size={20} color="white" />
        </div>
      )}
      {/* Left action bg (delete) — only rendered while swiping left */}
      {offsetX < -10 && (
        <div
          className="absolute inset-0 flex items-center justify-start pl-5 overflow-hidden"
          style={{ background: bgLeft, borderRadius: 16 }}
        >
          <Trash2 size={20} color="white" />
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
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={!('ontouchstart' in window) ? onPressStart : undefined}
        onPointerUp={!('ontouchstart' in window) ? onPressEnd : undefined}
        onPointerLeave={!('ontouchstart' in window) ? onPressEnd : undefined}
        onPointerCancel={!('ontouchstart' in window) ? onPressEnd : undefined}
      >
        {/* ── RIGHT SIDE: checkbox ── */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 44, alignSelf: 'stretch' }}>
          {multiSelect ? (
            <button onClick={onToggleSelect}>
              {isSelected
                ? <CheckSquare size={20} style={{ color: '#BF2C2C' }} />
                : <Square size={20} style={{ color: '#C4BAB0' }} />}
            </button>
          ) : (
            <button
              onClick={onToggle}
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
          <RowImage itemCode={item.item_code} name={item.item_name} />
        </div>

        {/* ── CENTER: name + subtitle ── */}
        <div
          className="flex-1 min-w-0 px-3 py-3"
          onClick={multiSelect ? onToggleSelect : undefined}
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
              {item.group_id ? (
                <Link
                  href={`/compare?group=${item.group_id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: '#BF2C2C' }}
                >
                  <GitCompare size={10} />
                  השווה מחירים
                </Link>
              ) : (
                <p className="text-xs truncate" style={{ color: '#B6AB9C' }}>{item.item_code}</p>
              )}
            </div>
          )}
        </div>

        {/* ── LEFT SIDE: quantity capsule (tall, narrow) ── */}
        {!multiSelect && !item.checked && (
          <div
            className="flex flex-col items-center shrink-0 pl-1 pr-3 py-2"
          >
            <div
              className="flex flex-col items-center"
              style={{
                background: 'rgba(182,171,156,0.2)',
                borderRadius: 999,
                border: '1px solid rgba(182,171,156,0.4)',
                width: 30,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => onUpdateQty(item.quantity + 1)}
                className="flex items-center justify-center font-bold"
                style={{ width: 30, height: 30, color: '#6b6259', fontSize: 17 }}
              >
                +
              </button>
              <span
                className="text-sm font-bold text-center"
                style={{ width: 30, lineHeight: '22px', color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}
              >
                {item.quantity}
              </span>
              <button
                onClick={() => onUpdateQty(item.quantity - 1)}
                className="flex items-center justify-center font-bold"
                style={{ width: 30, height: 30, color: '#6b6259', fontSize: 17 }}
              >
                −
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── TRASH: absolute circle floating in bottom-left corner of card ── */}
      {!multiSelect && (
        <button
          onClick={onDelete}
          className="absolute flex items-center justify-center z-10"
          style={{
            top: 6, left: 8,
            width: 22, height: 22,
            borderRadius: '50%',
            background: 'rgba(191,44,44,0.12)',
            color: 'rgba(191,44,44,0.65)',
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
                className="rounded-2xl p-3 mb-4 flex flex-col gap-1.5"
                style={{ background: 'rgba(233,216,197,0.85)', border: '1.5px solid rgba(182,171,156,0.4)' }}
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
                  />
                ))}
              </div>
            )}

            {/* Checked items */}
            {checked.length > 0 && (
              <div
                className="rounded-2xl p-3 flex flex-col gap-1.5 opacity-65"
                style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px solid rgba(182,171,156,0.3)' }}
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
    </div>
  );
}
