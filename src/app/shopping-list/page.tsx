'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Trash2, Check, Plus, Search, GitCompare, CheckSquare, Square } from 'lucide-react';
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
    if (multiSelect) {
      toggleSelect(item.id);
      return;
    }
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ checked: !item.checked })
      .eq('id', item.id);

    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i));
    }
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', id);

    if (!error) {
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success('הוסר מהרשימה');
    }
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

  // ── Multi-select helpers ──────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const exitMultiSelect = useCallback(() => {
    setMultiSelect(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = () => {
    setSelectedIds(new Set(items.map(i => i.id)));
  };

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

  // ── Long-press handlers ───────────────────────────────────────────────────────

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
    if (timer) {
      clearTimeout(timer);
      pressTimers.current.delete(id);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  if (!user) {
    return (
      <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ShoppingCart size={64} className="mx-auto mb-4" style={{ color: '#B6AB9C' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>רשימת הקניות שלך</h2>
          <p className="mb-6 text-sm" style={{ color: '#8a7f75' }}>התחבר כדי לשמור ולנהל את רשימת הקניות שלך</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 rounded-2xl font-bold text-sm"
            style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
          >
            התחבר
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
            <ShoppingCart size={22} style={{ color: '#BF2C2C' }} />
            רשימת קניות
          </h1>
          {!multiSelect && checked.length > 0 && (
            <button
              onClick={clearChecked}
              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}
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
              <button
                onClick={exitMultiSelect}
                className="text-xs px-2.5 py-1.5 rounded-xl font-medium"
                style={{ background: 'rgba(182,171,156,0.3)', color: '#4F483F' }}
              >
                ביטול
              </button>
              <span className="text-sm font-semibold" style={{ color: '#4F483F' }}>
                {selectedIds.size} נבחרו
              </span>
              <button
                onClick={selectAll}
                className="text-xs px-2.5 py-1.5 rounded-xl font-medium"
                style={{ background: 'rgba(182,171,156,0.3)', color: '#4F483F' }}
              >
                בחר הכל
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={bulkCheck}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold disabled:opacity-40"
                style={{ background: '#2d7a2d', color: 'white' }}
              >
                <Check size={13} />
                סמן
              </button>
              <button
                onClick={bulkDelete}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold disabled:opacity-40"
                style={{ background: '#BF2C2C', color: 'white' }}
              >
                <Trash2 size={13} />
                מחק
              </button>
            </div>
          </div>
        )}

        {/* Add item button — hidden in multi-select mode */}
        {!multiSelect && (
          <Link
            href="/search"
            className="flex items-center gap-3 p-4 rounded-2xl mb-5 transition-opacity hover:opacity-80"
            style={{
              background: 'rgba(233, 216, 197, 0.6)',
              border: '1.5px dashed rgba(182, 171, 156, 0.7)',
              color: '#8a7f75',
              fontFamily: 'Heebo, sans-serif',
            }}
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
                className="rounded-2xl p-4 mb-4"
                style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.4)' }}
              >
                <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(182, 171, 156, 0.3)' }}>
                  {unchecked.map(item => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 select-none"
                        style={{ background: isSelected ? 'rgba(191,44,44,0.07)' : undefined, borderRadius: isSelected ? 8 : undefined, transition: 'background 0.15s' }}
                        onPointerDown={() => handlePressStart(item.id)}
                        onPointerUp={() => handlePressEnd(item.id)}
                        onPointerLeave={() => handlePressEnd(item.id)}
                        onPointerCancel={() => handlePressEnd(item.id)}
                      >
                        {/* Checkbox / multi-select indicator */}
                        {multiSelect ? (
                          <button
                            onClick={() => toggleSelect(item.id)}
                            className="shrink-0 w-6 h-6 flex items-center justify-center"
                          >
                            {isSelected
                              ? <CheckSquare size={22} style={{ color: '#BF2C2C' }} />
                              : <Square size={22} style={{ color: '#B6AB9C' }} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleItem(item)}
                            className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                            style={{ borderColor: '#B6AB9C' }}
                          />
                        )}
                        {/* Name + type */}
                        <div
                          className="flex-1 min-w-0"
                          onClick={multiSelect ? () => toggleSelect(item.id) : undefined}
                          style={multiSelect ? { cursor: 'pointer' } : undefined}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.group_id && (
                              <span className="text-base shrink-0">📦</span>
                            )}
                            <p className="font-medium text-sm truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                              {item.item_name}
                            </p>
                          </div>
                          {!multiSelect && (item.group_id ? (
                            <Link
                              href={`/compare?group=${item.group_id}`}
                              className="text-xs flex items-center gap-1 mt-0.5"
                              style={{ color: '#BF2C2C' }}
                            >
                              <GitCompare size={11} />
                              השווה מחירים
                            </Link>
                          ) : (
                            <p className="text-xs" style={{ color: '#B6AB9C' }}>{item.item_code}</p>
                          ))}
                        </div>
                        {/* Quantity — hidden in multi-select */}
                        {!multiSelect && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm"
                              style={{ background: 'rgba(182, 171, 156, 0.3)', color: '#4F483F' }}
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-sm font-medium" style={{ color: '#4F483F' }}>{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm"
                              style={{ background: 'rgba(182, 171, 156, 0.3)', color: '#4F483F' }}
                            >
                              +
                            </button>
                          </div>
                        )}
                        {/* Delete — hidden in multi-select */}
                        {!multiSelect && (
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="transition-opacity hover:opacity-60"
                            style={{ color: '#B6AB9C' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Checked items */}
            {checked.length > 0 && (
              <div
                className="rounded-2xl p-4 opacity-60"
                style={{ background: 'rgba(233, 216, 197, 0.6)', border: '1.5px solid rgba(182, 171, 156, 0.3)' }}
              >
                <p className="text-xs mb-3 font-medium" style={{ color: '#8a7f75' }}>נרכשו ({checked.length})</p>
                <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(182, 171, 156, 0.3)' }}>
                  {checked.map(item => {
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 select-none"
                        style={{ background: isSelected ? 'rgba(191,44,44,0.07)' : undefined, borderRadius: isSelected ? 8 : undefined }}
                        onPointerDown={() => handlePressStart(item.id)}
                        onPointerUp={() => handlePressEnd(item.id)}
                        onPointerLeave={() => handlePressEnd(item.id)}
                        onPointerCancel={() => handlePressEnd(item.id)}
                      >
                        {multiSelect ? (
                          <button
                            onClick={() => toggleSelect(item.id)}
                            className="shrink-0 w-6 h-6 flex items-center justify-center"
                          >
                            {isSelected
                              ? <CheckSquare size={22} style={{ color: '#BF2C2C' }} />
                              : <Square size={22} style={{ color: '#B6AB9C' }} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleItem(item)}
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: '#2d7a2d' }}
                          >
                            <Check size={12} className="text-white" />
                          </button>
                        )}
                        <p
                          className="flex-1 text-sm line-through truncate"
                          style={{ color: '#8a7f75', cursor: multiSelect ? 'pointer' : undefined }}
                          onClick={multiSelect ? () => toggleSelect(item.id) : undefined}
                        >
                          {item.item_name}
                        </p>
                        {!multiSelect && (
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="transition-opacity hover:opacity-60"
                            style={{ color: '#B6AB9C' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Long-press hint — shown only when not in multi-select and list has items */}
            {!multiSelect && items.length > 0 && (
              <p className="text-center text-xs mt-4" style={{ color: '#B6AB9C', fontFamily: 'Heebo, sans-serif' }}>
                לחץ לחיצה ממושכת על פריט לבחירה מרובה
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
