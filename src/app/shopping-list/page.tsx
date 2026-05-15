'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Plus, Trash2, ChevronLeft, X, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const NAMED_LISTS_KEY = 'superzol_named_lists';

type StoreListItem = { item_code: string; item_name: string; quantity: number; price: number };
type StoreList = { store_name: string; items: StoreListItem[] };
type NamedList = { id: string; name: string; created_at: string };

function loadNamedLists(): NamedList[] {
  try {
    const raw = localStorage.getItem(NAMED_LISTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveNamedLists(lists: NamedList[]) {
  try { localStorage.setItem(NAMED_LISTS_KEY, JSON.stringify(lists)); } catch { /* ignore */ }
}

// ── New list bottom sheet ─────────────────────────────────────────────────────
function NewListSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const justOpened = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => {
      justOpened.current = false;
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={() => { if (!justOpened.current) onClose(); }} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{ background: '#EDE4DA', borderRadius: '24px 24px 0 0', boxShadow: '0 -4px 32px rgba(0,0,0,0.18)', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
        dir="rtl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(79,72,63,0.25)' }} />
        </div>
        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 left-4 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(79,72,63,0.1)', color: '#4F483F' }}>
          <X size={16} />
        </button>
        {/* Content */}
        <div className="px-5 pt-2 pb-6">
          <h2 className="text-lg font-bold text-center mb-4" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
            רשימה חדשה
          </h2>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="שם הרשימה..."
            className="w-full px-4 py-3 rounded-2xl text-sm font-medium outline-none mb-4"
            style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#3a342c', fontFamily: 'Heebo, sans-serif', direction: 'rtl' }}
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm disabled:opacity-40"
            style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
          >
            <Check size={16} />
            צור רשימה
          </button>
        </div>
      </div>
    </>
  );
}

export default function ShoppingListsOverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [mainItemCount, setMainItemCount] = useState<number | null>(null);
  const [storeLists, setStoreLists] = useState<StoreList[]>([]);
  const [namedLists, setNamedLists] = useState<NamedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewListSheet, setShowNewListSheet] = useState(false);

  // Load user + main list item count
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        supabase
          .from('shopping_list_items')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .then(({ count }) => { setMainItemCount(count ?? 0); setLoading(false); });
      } else {
        setLoading(false);
      }
    });
  }, []);

  // Load store lists from sessionStorage + named lists from localStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('superzol_store_lists');
      if (raw) {
        const parsed: StoreList[] = JSON.parse(raw);
        if (Array.isArray(parsed)) setStoreLists(parsed);
      }
    } catch { /* ignore */ }
    setNamedLists(loadNamedLists());
  }, []);

  const handleCreateNamedList = useCallback((name: string) => {
    const newList: NamedList = { id: crypto.randomUUID(), name, created_at: new Date().toISOString() };
    setNamedLists(prev => {
      const updated = [...prev, newList];
      saveNamedLists(updated);
      return updated;
    });
    toast.success(`הרשימה "${name}" נוצרה`);
    router.push(`/shopping-list/named-${newList.id}`);
  }, [router]);

  const deleteNamedList = useCallback((id: string) => {
    setNamedLists(prev => {
      const updated = prev.filter(l => l.id !== id);
      saveNamedLists(updated);
      // Also remove items for this list
      try { localStorage.removeItem(`superzol_named_list_items_${id}`); } catch { /* ignore */ }
      return updated;
    });
    toast.success('הרשימה נמחקה');
  }, []);

  const deleteStoreList = useCallback((storeName: string) => {
    setStoreLists(prev => {
      const updated = prev.filter(l => l.store_name !== storeName);
      try {
        sessionStorage.setItem('superzol_store_lists', JSON.stringify(updated));
        const currentStore = sessionStorage.getItem('superzol_list_store');
        if (currentStore === storeName) sessionStorage.removeItem('superzol_list_store');
      } catch { /* ignore */ }
      return updated;
    });
    toast.success('הרשימה נמחקה');
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ShoppingCart size={64} className="mx-auto mb-4" style={{ color: '#B6AB9C' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>רשימות קניות</h2>
          <p className="mb-6 text-sm" style={{ color: '#8a7f75' }}>התחבר כדי לשמור ולנהל את רשימות הקניות שלך</p>
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
            רשימות קניות
          </h1>
          <button
            onClick={() => setShowNewListSheet(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold"
            style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
          >
            <Plus size={15} />
            רשימה חדשה
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16 gap-3" style={{ color: '#8a7f75' }}>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
            <span className="text-sm">טוען...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">

            {/* Main Supabase list */}
            <Link
              href="/shopping-list/main"
              className="flex items-center justify-between px-4 py-4 rounded-2xl transition-opacity hover:opacity-80"
              style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.4)' }}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'rgba(191,44,44,0.12)' }}>
                  <ShoppingCart size={20} style={{ color: '#BF2C2C' }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>רשימת הקניות שלי</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>{mainItemCount === null ? '...' : `${mainItemCount} פריטים`}</p>
                </div>
              </div>
              <ChevronLeft size={18} style={{ color: '#B6AB9C' }} />
            </Link>

            {/* Named lists (localStorage) */}
            {namedLists.length > 0 && (
              <>
                <p className="text-xs font-medium px-1 mt-2" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>רשימות שלי</p>
                {namedLists.map(list => (
                  <div key={list.id} className="flex items-center justify-between px-4 py-4 rounded-2xl"
                    style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
                    <Link href={`/shopping-list/named-${list.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'rgba(79,72,63,0.1)' }}>
                        <ShoppingCart size={20} style={{ color: '#4F483F' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>{list.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>
                          {new Date(list.created_at).toLocaleDateString('he-IL')}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 mr-2">
                      <ChevronLeft size={18} style={{ color: '#B6AB9C' }} />
                      <button
                        onClick={e => { e.preventDefault(); deleteNamedList(list.id); }}
                        className="flex items-center justify-center w-8 h-8 rounded-full"
                        style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C' }}
                        title="מחק רשימה"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Store-specific lists from sessionStorage */}
            {storeLists.length > 0 && (
              <>
                <p className="text-xs font-medium px-1 mt-2" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>רשימות מהשוואת מחירים</p>
                {storeLists.map(storeList => {
                  const total = storeList.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
                  const encodedName = encodeURIComponent(storeList.store_name);
                  return (
                    <div key={storeList.store_name} className="flex items-center justify-between px-4 py-4 rounded-2xl"
                      style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
                      <Link href={`/shopping-list/store-${encodedName}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'rgba(45,122,45,0.12)' }}>
                          <ShoppingCart size={20} style={{ color: '#2d7a2d' }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>{storeList.store_name}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>{storeList.items.length} פריטים · ₪{total.toFixed(2)}</p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0 mr-2">
                        <ChevronLeft size={18} style={{ color: '#B6AB9C' }} />
                        <button
                          onClick={e => { e.preventDefault(); deleteStoreList(storeList.store_name); }}
                          className="flex items-center justify-center w-8 h-8 rounded-full"
                          style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C' }}
                          title="מחק רשימה"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Empty state */}
            {namedLists.length === 0 && storeLists.length === 0 && mainItemCount === 0 && (
              <div className="text-center py-10" style={{ color: '#8a7f75' }}>
                <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין פריטים ברשימה</p>
                <p className="text-xs mt-1">לחץ על "רשימה חדשה" כדי להתחיל</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New list bottom sheet */}
      {showNewListSheet && (
        <NewListSheet
          onClose={() => setShowNewListSheet(false)}
          onCreate={handleCreateNamedList}
        />
      )}
    </div>
  );
}
