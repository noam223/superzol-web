'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Trash2, Check, Plus, Search } from 'lucide-react';
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

export default function ShoppingListPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);

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
          {checked.length > 0 && (
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

        {/* Add item button */}
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
                  {unchecked.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleItem(item)}
                        className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                        style={{ borderColor: '#B6AB9C' }}
                      />
                      {/* Name + barcode */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                            {item.item_name}
                          </p>
                          {item.group_id && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0"
                              style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C' }}
                            >
                              🏷️
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: '#B6AB9C' }}>{item.item_code}</p>
                      </div>
                      {/* Quantity */}
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
                      {/* Delete */}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="transition-opacity hover:opacity-60"
                        style={{ color: '#B6AB9C' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
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
                  {checked.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <button
                        onClick={() => toggleItem(item)}
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: '#2d7a2d' }}
                      >
                        <Check size={12} className="text-white" />
                      </button>
                      <p className="flex-1 text-sm line-through truncate" style={{ color: '#8a7f75' }}>{item.item_name}</p>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="transition-opacity hover:opacity-60"
                        style={{ color: '#B6AB9C' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
