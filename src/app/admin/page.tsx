'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Search, Plus, Trash2, X, Tag, CheckCircle2, Circle,
  Package, Star, Pencil, Save, GripVertical, Camera, ScanBarcode,
} from 'lucide-react';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { formatUnitInfo } from '@/lib/typesense';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

const ADMIN_EMAIL = 'noamnisim@gmail.com';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductGroup = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  item_count?: number;
  image_item_code?: string | null;
  is_fresh_product?: boolean;
};

type GroupItem = {
  id: string;
  group_id: string;
  item_code: string;
  item_name: string | null;
};

type SearchResult = {
  item_code: string;
  item_name: string;
  manufacturer_name?: string;
  unit_qty?: string;
  quantity?: number;
  unit_of_measure?: string;
  min_price: number;
  chain_count: number;
};

type FeaturedItem = {
  id: string;
  item_code: string;
  item_name: string | null;
  sort_order: number;
  active: boolean;
};

type Tab = 'groups' | 'products' | 'featured';

// ── Shared helpers ────────────────────────────────────────────────────────────

function ProductThumb({ itemCode, name, unitInfo }: { itemCode: string; name: string; unitInfo?: string | null }) {
  const [src, setSrc] = useState(() => getProductImageUrl(itemCode));
  const [failed, setFailed] = useState(false);
  // Reset image when itemCode changes (e.g. after setGroupImage)
  useEffect(() => {
    setSrc(getProductImageUrl(itemCode));
    setFailed(false);
  }, [itemCode]);
  const img = failed ? (
    <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,#f0e8e0,#e8ddd5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🛒</div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name}
      onError={() => { if (src === getProductImageUrl(itemCode)) setSrc(getProductImageFallback(itemCode)); else setFailed(true); }}
      style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8, flexShrink: 0, background: '#f8f4f0' }}
    />
  );
  if (!unitInfo) return img;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      {img}
      <span style={{ fontSize: 9, fontWeight: 700, color: '#6b6259', background: 'rgba(182,171,156,0.28)', borderRadius: 5, padding: '1px 4px', maxWidth: 44, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
        {unitInfo}
      </span>
    </div>
  );
}

async function searchProducts(q: string, excludeCodes?: Set<string>): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({
    collection: 'products_index', q,
    query_by: 'item_name,manufacturer_name,manufacturer_item_id',
    query_by_weights: '4,1,1',
    per_page: '50',
    num_typos: '1',
    min_len_1typo: '4',
    min_len_2typo: '7',
    prefix: 'true,false,false',
    prioritize_exact_prefix_match: 'true',
    sort_by: '_text_match:desc,chain_count:desc,min_price:asc',
  });
  try {
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    let hits = (data.hits || []).map((h: { document: SearchResult }) => h.document);
    if (excludeCodes && excludeCodes.size > 0) {
      hits = hits.filter((p: SearchResult) => !excludeCodes.has(p.item_code));
    }
    return hits;
  } catch { return []; }
}

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
      style={{ background: active ? '#BF2C2C' : 'rgba(233,216,197,0.7)', color: active ? 'white' : '#4F483F', border: active ? 'none' : '1.5px solid rgba(182,171,156,0.4)', fontFamily: 'Heebo, sans-serif' }}>
      {icon}{label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: Product Groups
// ═══════════════════════════════════════════════════════════════════════════════
function GroupsTab() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [groupItems, setGroupItems] = useState<GroupItem[]>([]);
  const [groupItemsLoading, setGroupItemsLoading] = useState(false);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  // Multi-select state for product search results
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);
  // Group sidebar filter
  const [groupFilter, setGroupFilter] = useState('');
  // All item_codes that belong to ANY group (for filtering search results)
  const [allGroupedCodes, setAllGroupedCodes] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  // Rename group state
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadGroups = async () => {
    setGroupsLoading(true);
    const { data } = await supabase.from('product_groups').select('*, product_group_items(count)').order('name', { ascending: true });
    setGroups((data || []).map((g: ProductGroup & { product_group_items: { count: number }[] }) => ({ ...g, item_count: g.product_group_items?.[0]?.count ?? 0 })));
    setGroupsLoading(false);
  };

  // Load all grouped item codes for filtering
  const loadAllGroupedCodes = useCallback(async () => {
    const { data } = await supabase.from('product_group_items').select('item_code');
    setAllGroupedCodes(new Set((data || []).map((r: { item_code: string }) => r.item_code)));
  }, []);

  useEffect(() => { loadGroups(); loadAllGroupedCodes(); }, [loadAllGroupedCodes]);

  const loadGroupItems = useCallback(async (groupId: string) => {
    setGroupItemsLoading(true);
    const { data } = await supabase.from('product_group_items').select('*').eq('group_id', groupId).order('created_at');
    setGroupItems(data || []);
    setGroupItemsLoading(false);
  }, []);

  const selectGroup = (group: ProductGroup) => {
    setSelectedGroup(group); setSearchQuery(''); setSearchResults([]); setSelectedCodes(new Set());
    setRenamingGroup(false); setRenameValue('');
    loadGroupItems(group.id);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    const { data, error } = await supabase.from('product_groups').insert({ name: newGroupName.trim(), description: newGroupDesc.trim() || null }).select().single();
    if (error) { toast.error('שגיאה ביצירת קבוצה'); }
    else { toast.success(`קבוצה "${newGroupName}" נוצרה`); setNewGroupName(''); setNewGroupDesc(''); setShowNewGroupForm(false); await loadGroups(); if (data) selectGroup({ ...data, item_count: 0 }); }
    setAddingGroup(false);
  };

  const startRename = () => {
    if (!selectedGroup) return;
    setRenameValue(selectedGroup.name);
    setRenamingGroup(true);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const cancelRename = () => {
    setRenamingGroup(false);
    setRenameValue('');
  };

  const saveRename = async () => {
    if (!selectedGroup || !renameValue.trim()) return;
    const trimmed = renameValue.trim();
    if (trimmed === selectedGroup.name) { cancelRename(); return; }
    setSavingRename(true);
    const { error } = await supabase.from('product_groups').update({ name: trimmed }).eq('id', selectedGroup.id);
    if (error) {
      toast.error('שגיאה בשינוי שם');
    } else {
      setSelectedGroup(prev => prev ? { ...prev, name: trimmed } : prev);
      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, name: trimmed } : g));
      toast.success('שם הקבוצה עודכן ✓', { duration: 1500 });
      setRenamingGroup(false);
      setRenameValue('');
    }
    setSavingRename(false);
  };

  const deleteGroup = async (group: ProductGroup) => {
    if (!confirm(`למחוק את הקבוצה "${group.name}"?`)) return;
    const { error } = await supabase.from('product_groups').delete().eq('id', group.id);
    if (error) toast.error('שגיאה במחיקת קבוצה');
    else {
      toast.success('קבוצה נמחקה');
      if (selectedGroup?.id === group.id) { setSelectedGroup(null); setGroupItems([]); }
      await loadGroups();
      await loadAllGroupedCodes();
    }
  };

  const setGroupImage = useCallback(async (groupId: string, itemCode: string) => {
    await supabase.from('product_groups').update({ image_item_code: itemCode }).eq('id', groupId);
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, image_item_code: itemCode } : g));
    setSelectedGroup(prev => prev?.id === groupId ? { ...prev, image_item_code: itemCode } : prev);
    toast.success('תמונת הקבוצה עודכנה', { duration: 1200 });
  }, []);

  const toggleFreshProduct = async (group: ProductGroup) => {
    const newVal = !group.is_fresh_product;
    const { error } = await supabase.from('product_groups').update({ is_fresh_product: newVal }).eq('id', group.id);
    if (error) { toast.error('שגיאה בעדכון'); return; }
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_fresh_product: newVal } : g));
    setSelectedGroup(prev => prev?.id === group.id ? { ...prev, is_fresh_product: newVal } : prev);
    toast.success(newVal ? '🥩 סומן כמוצר טרי' : 'הוסר סימון מוצר טרי', { duration: 1500 });
  };

  const toggleItemInGroup = async (product: SearchResult) => {
    if (!selectedGroup) return;
    const existing = groupItems.find(i => i.item_code === product.item_code);
    setAddingItem(product.item_code);
    if (existing) {
      const { error } = await supabase.from('product_group_items').delete().eq('id', existing.id);
      if (!error) {
        const newItems = groupItems.filter(i => i.id !== existing.id);
        setGroupItems(newItems);
        setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, item_count: (g.item_count ?? 1) - 1 } : g));
        setAllGroupedCodes(prev => { const s = new Set(prev); s.delete(product.item_code); return s; });
        // If removed item was the group image, clear it
        if (selectedGroup.image_item_code === product.item_code) {
          const nextImage = newItems[0]?.item_code || null;
          await supabase.from('product_groups').update({ image_item_code: nextImage }).eq('id', selectedGroup.id);
          setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, image_item_code: nextImage } : g));
          setSelectedGroup(prev => prev ? { ...prev, image_item_code: nextImage } : prev);
        }
        // Remove from search results so it reappears
        setSearchResults(prev => prev.filter(r => r.item_code !== product.item_code));
      }
    } else {
      const { data, error } = await supabase.from('product_group_items').insert({ group_id: selectedGroup.id, item_code: product.item_code, item_name: product.item_name }).select().single();
      if (!error && data) {
        setGroupItems(prev => [...prev, data]);
        setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, item_count: (g.item_count ?? 0) + 1 } : g));
        setAllGroupedCodes(prev => { const s = new Set(prev); s.add(product.item_code); return s; });
        toast.success('נוסף ✓', { duration: 1200 });
        // Auto-set group image from first item
        if (!selectedGroup.image_item_code) {
          await setGroupImage(selectedGroup.id, product.item_code);
        }
        // Remove from search results (already grouped)
        setSearchResults(prev => prev.filter(r => r.item_code !== product.item_code));
      }
    }
    setAddingItem(null);
  };

  const removeItemFromGroup = async (item: GroupItem) => {
    const { error } = await supabase.from('product_group_items').delete().eq('id', item.id);
    if (!error) {
      const newItems = groupItems.filter(i => i.id !== item.id);
      setGroupItems(newItems);
      setGroups(prev => prev.map(g => g.id === selectedGroup?.id ? { ...g, item_count: (g.item_count ?? 1) - 1 } : g));
      setAllGroupedCodes(prev => { const s = new Set(prev); s.delete(item.item_code); return s; });
      // If removed item was the group image, auto-switch to next
      if (selectedGroup?.image_item_code === item.item_code) {
        const nextImage = newItems[0]?.item_code || null;
        await supabase.from('product_groups').update({ image_item_code: nextImage }).eq('id', selectedGroup.id);
        setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, image_item_code: nextImage } : g));
        setSelectedGroup(prev => prev ? { ...prev, image_item_code: nextImage } : prev);
      }
    }
  };

  const addBulkToGroup = async () => {
    if (!selectedGroup || selectedCodes.size === 0) return;
    setAddingBulk(true);
    let addedCount = 0;
    for (const code of Array.from(selectedCodes)) {
      const product = searchResults.find(r => r.item_code === code);
      if (!product) continue;
      const alreadyIn = groupItems.some(i => i.item_code === code);
      if (alreadyIn) continue;
      const { data, error } = await supabase
        .from('product_group_items')
        .insert({ group_id: selectedGroup.id, item_code: product.item_code, item_name: product.item_name })
        .select()
        .single();
      if (!error && data) {
        setGroupItems(prev => [...prev, data]);
        setAllGroupedCodes(prev => { const s = new Set(prev); s.add(code); return s; });
        addedCount++;
        if (!selectedGroup.image_item_code && addedCount === 1) {
          await setGroupImage(selectedGroup.id, product.item_code);
        }
      }
    }
    if (addedCount > 0) {
      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, item_count: (g.item_count ?? 0) + addedCount } : g));
      toast.success(`נוספו ${addedCount} מוצרים ✓`, { duration: 1800 });
      setSearchResults(prev => prev.filter(r => !selectedCodes.has(r.item_code)));
    }
    setSelectedCodes(new Set());
    setAddingBulk(false);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    // Exclude items already in ANY group from search results
    const excludeCodes = new Set(Array.from(allGroupedCodes));
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchResults(await searchProducts(searchQuery, excludeCodes));
      setSearching(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, allGroupedCodes]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && searchResults.length > 0 && selectedGroup) toggleItemInGroup(searchResults[0]); };

  // Barcode scan handler for admin group scanner — stays open, adds product directly
  const handleBarcodeScan = useCallback(async (code: string) => {
    if (!selectedGroup) return;
    // Search for the scanned barcode
    const results = await searchProducts(code);
    if (results.length === 0) {
      toast.error(`מוצר לא נמצא: ${code}`, { duration: 2000 });
      return;
    }
    const product = results[0];
    // Check if already in group
    const alreadyIn = groupItems.some(i => i.item_code === product.item_code);
    if (alreadyIn) {
      toast(`כבר בקבוצה: ${product.item_name}`, { icon: '✓', duration: 1500 });
      return;
    }
    // Add to group
    const { data, error } = await supabase.from('product_group_items').insert({ group_id: selectedGroup.id, item_code: product.item_code, item_name: product.item_name }).select().single();
    if (!error && data) {
      setGroupItems(prev => [...prev, data]);
      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, item_count: (g.item_count ?? 0) + 1 } : g));
      setAllGroupedCodes(prev => { const s = new Set(prev); s.add(product.item_code); return s; });
      if (!selectedGroup.image_item_code) {
        await setGroupImage(selectedGroup.id, product.item_code);
      }
      toast.success(`נוסף: ${product.item_name}`, { duration: 1500 });
    } else {
      toast.error('שגיאה בהוספת מוצר');
    }
    // Scanner stays open — user scans next product
  }, [selectedGroup, groupItems, setGroupImage]);

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start" dir="rtl">
      {/* Sidebar — hidden on mobile when a group is selected */}
      <div className={`w-full md:w-64 md:shrink-0 flex flex-col gap-2 ${selectedGroup ? 'hidden md:flex' : 'flex'}`}>
        <button onClick={() => setShowNewGroupForm(v => !v)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm hover:opacity-80" style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}>
          <Plus size={15} /> קבוצה חדשה
        </button>
        {/* Group filter input */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={14} style={{ color: '#8a7f75' }} />
          <input
            type="text"
            placeholder="חפש קבוצה..."
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="w-full pr-8 pl-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.7)', border: '1.5px solid rgba(182,171,156,0.4)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
          />
          {groupFilter && (
            <button onClick={() => setGroupFilter('')} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#8a7f75' }}><X size={13} /></button>
          )}
        </div>
        {showNewGroupForm && (
          <div className="rounded-2xl p-3" style={{ background: 'rgba(233,216,197,0.95)', border: '1.5px solid rgba(182,171,156,0.5)' }}>
            <input type="text" placeholder="שם הקבוצה" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGroup()} autoFocus className="w-full px-3 py-2 rounded-xl text-sm mb-2 outline-none" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(182,171,156,0.4)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }} />
            <input type="text" placeholder="תיאור (אופציונלי)" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGroup()} className="w-full px-3 py-2 rounded-xl text-sm mb-2 outline-none" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(182,171,156,0.4)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }} />
            <div className="flex gap-2">
              <button onClick={createGroup} disabled={addingGroup || !newGroupName.trim()} className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-40 hover:opacity-80" style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}>{addingGroup ? '...' : 'צור'}</button>
              <button onClick={() => { setShowNewGroupForm(false); setNewGroupName(''); setNewGroupDesc(''); }} className="px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(182,171,156,0.3)', color: '#4F483F' }}>✕</button>
            </div>
          </div>
        )}
        {groupsLoading ? <div className="flex justify-center py-6"><div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} /></div>
          : groups.length === 0 ? <p className="text-sm text-center py-6" style={{ color: '#8a7f75' }}>אין קבוצות עדיין</p>
          : groups.filter(g => !groupFilter.trim() || g.name.toLowerCase().includes(groupFilter.trim().toLowerCase())).map(group => (
            <div key={group.id} onClick={() => selectGroup(group)} className="flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer transition-all group" style={{ background: selectedGroup?.id === group.id ? 'rgba(191,44,44,0.1)' : 'rgba(233,216,197,0.85)', border: selectedGroup?.id === group.id ? '1.5px solid rgba(191,44,44,0.35)' : '1.5px solid rgba(182,171,156,0.4)' }}>
              <ProductThumb key={group.image_item_code || group.id} itemCode={group.image_item_code || ''} name={group.name} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                  {group.is_fresh_product && <span className="mr-1" title="מוצר טרי">🥩</span>}
                  {group.name}
                </p>
                <p className="text-xs" style={{ color: '#8a7f75' }}>{group.item_count ?? 0} מוצרים</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteGroup(group); }} className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#BF2C2C' }}><Trash2 size={13} /></button>
            </div>
          ))}
      </div>

      {/* Detail panel — full width on mobile */}
      <div className="flex-1 min-w-0 w-full">
        {!selectedGroup ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px dashed rgba(182,171,156,0.5)' }}>
            <Tag size={36} className="mx-auto mb-3 opacity-20" style={{ color: '#4F483F' }} />
            <p className="text-sm" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>בחר קבוצה מהרשימה</p>
          </div>
        ) : (
          <div className="rounded-2xl p-4 md:p-5" style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
            {/* Mobile back button */}
            <button
              onClick={() => { setSelectedGroup(null); setGroupItems([]); setSearchQuery(''); setSearchResults([]); }}
              className="flex md:hidden items-center gap-1.5 mb-3 text-sm font-medium"
              style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
            >
              <span style={{ fontSize: 18 }}>›</span> חזרה לקבוצות
            </button>
            <div className="flex items-center gap-3 mb-4">
              <ProductThumb itemCode={selectedGroup.image_item_code || ''} name={selectedGroup.name} />
              <div className="flex-1 min-w-0">
                {renamingGroup ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg text-base font-bold outline-none"
                      style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif', background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(191,44,44,0.5)' }}
                    />
                    <button
                      onClick={saveRename}
                      disabled={savingRename || !renameValue.trim()}
                      className="shrink-0 p-1.5 rounded-lg disabled:opacity-40 hover:opacity-80"
                      style={{ background: '#BF2C2C', color: 'white' }}
                      title="שמור שם"
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={cancelRename}
                      className="shrink-0 p-1.5 rounded-lg hover:opacity-70"
                      style={{ background: 'rgba(182,171,156,0.25)', color: '#4F483F' }}
                      title="בטל"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startRename}
                    className="flex items-center gap-1.5 group/rename text-right w-full"
                    title="לחץ לשינוי שם"
                  >
                    <h2 className="text-lg font-bold truncate group-hover/rename:underline" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>{selectedGroup.name}</h2>
                    <Pencil size={13} className="shrink-0 opacity-0 group-hover/rename:opacity-60 transition-opacity" style={{ color: '#4F483F' }} />
                  </button>
                )}
                {selectedGroup.description && <p className="text-xs mt-0.5 truncate" style={{ color: '#8a7f75' }}>{selectedGroup.description}</p>}
              </div>
              {/* Fresh product toggle */}
              <button
                onClick={() => toggleFreshProduct(selectedGroup)}
                title={selectedGroup.is_fresh_product ? 'מוצר טרי – לחץ לביטול' : 'סמן כמוצר טרי (בשר/עוף)'}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: selectedGroup.is_fresh_product ? 'rgba(176,90,0,0.12)' : 'rgba(182,171,156,0.15)',
                  color: selectedGroup.is_fresh_product ? '#b05a00' : '#8a7f75',
                  border: selectedGroup.is_fresh_product ? '1.5px solid rgba(176,90,0,0.35)' : '1.5px solid rgba(182,171,156,0.3)',
                  fontFamily: 'Heebo, sans-serif',
                }}
              >
                🥩 {selectedGroup.is_fresh_product ? 'טרי' : 'טרי?'}
              </button>
            </div>
            <div className="mb-5">
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: '#8a7f75' }} />
                  <input ref={searchInputRef} type="text" placeholder="חפש מוצר להוספה... (Enter להוספת הראשון)" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full pr-9 pl-9 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }} />
                  {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8a7f75' }}><X size={14} /></button>}
                </div>
                {/* Barcode scanner button */}
                <button
                  onClick={() => setShowScanner(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
                  title="סרוק ברקוד"
                >
                  <ScanBarcode size={16} />
                  סרוק
                </button>
              </div>
              {/* Barcode scanner overlay — stays open after each scan */}
              {showScanner && (
                <BarcodeScanner
                  title={`סרוק מוצרים לקבוצה: ${selectedGroup.name}`}
                  onScan={handleBarcodeScan}
                  onClose={() => setShowScanner(false)}
                />
              )}
              {(searching || searchResults.length > 0) && (
                <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(182,171,156,0.4)', background: 'rgba(255,255,255,0.85)' }}>
                  {/* "הוסף הכל" bulk action bar */}
                  {!searching && selectedCodes.size > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(182,171,156,0.3)', background: 'rgba(191,44,44,0.06)' }}>
                      <span className="text-xs font-medium" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                        {selectedCodes.size} נבחרו
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedCodes(new Set())}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: '#8a7f75', background: 'rgba(182,171,156,0.2)' }}
                        >
                          בטל
                        </button>
                        <button
                          onClick={addBulkToGroup}
                          disabled={addingBulk}
                          className="text-xs px-3 py-1 rounded-lg font-bold disabled:opacity-50"
                          style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
                        >
                          {addingBulk ? '...' : `הוסף הכל (${selectedCodes.size})`}
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Scrollable results list */}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {searching ? <div className="flex items-center justify-center py-5"><div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} /></div>
                      : searchResults.map((product, idx) => {
                        const inGroup = groupItems.some(i => i.item_code === product.item_code);
                        const isAdding = addingItem === product.item_code;
                        const isSelected = selectedCodes.has(product.item_code);
                        return (
                          <div key={product.item_code} className="flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 transition-colors hover:bg-black/5" style={{ borderColor: 'rgba(182,171,156,0.2)', background: isSelected ? 'rgba(191,44,44,0.06)' : undefined }}>
                            {/* Checkbox for multi-select */}
                            <button
                              onClick={() => {
                                setSelectedCodes(prev => {
                                  const s = new Set(prev);
                                  if (s.has(product.item_code)) s.delete(product.item_code);
                                  else s.add(product.item_code);
                                  return s;
                                });
                              }}
                              className="shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors"
                              style={{
                                borderColor: isSelected ? '#BF2C2C' : '#B6AB9C',
                                background: isSelected ? '#BF2C2C' : 'transparent',
                              }}
                            >
                              {isSelected && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
                            </button>
                            {/* Main row — click to toggle in group */}
                            <button onClick={() => toggleItemInGroup(product)} disabled={isAdding} className="flex-1 flex items-center gap-3 text-right disabled:opacity-60">
                              <ProductThumb itemCode={product.item_code} name={product.item_name} unitInfo={formatUnitInfo(product)} />
                              <div className="flex-1 min-w-0 text-right">
                                <p className="text-sm font-medium truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                                  {idx === 0 && <span className="text-xs opacity-40 ml-1">[Enter]</span>}{product.item_name}
                                </p>
                                <p className="text-xs" style={{ color: '#8a7f75' }}>
                                  {product.item_code}{product.manufacturer_name ? ` · ${product.manufacturer_name}` : ''}
                                  {product.unit_qty ? ` · ${product.unit_qty}${product.unit_of_measure ? ' ' + product.unit_of_measure : ''}` : ''}
                                  {` · ₪${product.min_price?.toFixed(2)} · ${product.chain_count} רשתות`}
                                </p>
                              </div>
                              <div className="shrink-0">
                                {isAdding ? <div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
                                  : inGroup ? <CheckCircle2 size={20} style={{ color: '#2d7a2d' }} />
                                  : <Circle size={20} style={{ color: '#B6AB9C' }} />}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>מוצרים בקבוצה ({groupItems.length})</p>
              {groupItemsLoading ? <div className="flex justify-center py-6"><div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} /></div>
                : groupItems.length === 0 ? (
                  <div className="rounded-xl py-8 text-center" style={{ background: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(182,171,156,0.4)' }}>
                    <p className="text-sm" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>חפש מוצרים למעלה והוסף אותם לקבוצה</p>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(182,171,156,0.4)' }}>
                    {groupItems.map(item => {
                      const isImage = selectedGroup?.image_item_code === item.item_code;
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 group/item" style={{ borderColor: 'rgba(182,171,156,0.2)', background: isImage ? 'rgba(191,44,44,0.05)' : 'rgba(255,255,255,0.6)' }}>
                          <div className="relative shrink-0">
                            <ProductThumb itemCode={item.item_code} name={item.item_name || item.item_code} />
                            {isImage && (
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background: '#BF2C2C', fontSize: 8 }}>📷</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <Link href={`/product/${item.item_code}`} target="_blank" className="hover:underline">
                              <p className="text-sm font-medium truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                                {item.item_name || item.item_code}
                                {isImage && <span className="mr-1.5 text-xs font-normal" style={{ color: '#BF2C2C' }}>תמונת קבוצה</span>}
                              </p>
                            </Link>
                            <p className="text-xs" style={{ color: '#8a7f75' }}>{item.item_code}</p>
                          </div>
                          {/* Set as image button */}
                          {!isImage && (
                            <button
                              onClick={() => setGroupImage(selectedGroup!.id, item.item_code)}
                              className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity"
                              style={{ color: '#8a7f75', background: 'rgba(182,171,156,0.15)' }}
                              title="הגדר כתמונת קבוצה"
                            >
                              <Camera size={14} />
                            </button>
                          )}
                          <button onClick={() => removeItemFromGroup(item)} className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity" style={{ color: '#BF2C2C', background: 'rgba(191,44,44,0.08)' }}><X size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: Products (edit name/tags, delete)
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SearchResult | null>(null);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => { setSearching(true); setSearchResults(await searchProducts(searchQuery)); setSearching(false); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const selectProduct = (p: SearchResult) => { setSelectedProduct(p); setEditName(p.item_name); setEditTags(''); };

  const handleSave = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    const authHeader = await getAuthHeader();
    const res = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ item_code: selectedProduct.item_code, item_name: editName.trim() || undefined, search_tags: editTags.trim() ? editTags.split(',').map(t => t.trim()).filter(Boolean) : undefined }),
    });
    if (res.ok) {
      toast.success('מוצר עודכן');
      setSelectedProduct(prev => prev ? { ...prev, item_name: editName.trim() || prev.item_name } : null);
      setSearchResults(prev => prev.map(p => p.item_code === selectedProduct.item_code ? { ...p, item_name: editName.trim() || p.item_name } : p));
    } else { toast.error('שגיאה בעדכון'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    if (!confirm(`למחוק את המוצר "${selectedProduct.item_name}" לגמרי מהמסד?`)) return;
    setDeleting(true);
    const authHeader = await getAuthHeader();
    const res = await fetch(`/api/admin/products?item_code=${encodeURIComponent(selectedProduct.item_code)}`, { method: 'DELETE', headers: { Authorization: authHeader } });
    if (res.ok) { toast.success('מוצר נמחק'); setSearchResults(prev => prev.filter(p => p.item_code !== selectedProduct.item_code)); setSelectedProduct(null); }
    else { toast.error('שגיאה במחיקה'); }
    setDeleting(false);
  };

  return (
    <div dir="rtl">
      {/* Search panel — full width */}
      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: '#8a7f75' }} />
        <input type="text" placeholder="חפש מוצר לעריכה..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus className="w-full pr-9 pl-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }} />
      </div>
      {searching ? <div className="flex justify-center py-6"><div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} /></div>
        : searchResults.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {searchResults.map(p => (
              <button key={p.item_code} onClick={() => selectProduct(p)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-right transition-all" style={{ background: selectedProduct?.item_code === p.item_code ? 'rgba(191,44,44,0.1)' : 'rgba(233,216,197,0.85)', border: selectedProduct?.item_code === p.item_code ? '1.5px solid rgba(191,44,44,0.35)' : '1.5px solid rgba(182,171,156,0.4)' }}>
                <ProductThumb itemCode={p.item_code} name={p.item_name} unitInfo={formatUnitInfo(p)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>{p.item_name}</p>
                  <p className="text-xs" style={{ color: '#8a7f75' }}>{p.item_code}</p>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery && !searching ? <p className="text-sm text-center py-6" style={{ color: '#8a7f75' }}>לא נמצאו תוצאות</p> : null}

      {/* Bottom sheet overlay — edit product */}
      {selectedProduct && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setSelectedProduct(null)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl p-5 pb-8"
            style={{ background: '#EDE4DA', boxShadow: '0 -4px 32px rgba(0,0,0,0.18)' }}
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(79,72,63,0.25)' }} />

            {/* Product header */}
            <div className="flex items-center gap-3 mb-5">
              <ProductThumb itemCode={selectedProduct.item_code} name={selectedProduct.item_name} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: '#4F483F' }}>{selectedProduct.item_name}</p>
                <p className="text-xs" style={{ color: '#8a7f75' }}>{selectedProduct.item_code} · ₪{selectedProduct.min_price?.toFixed(2)} · {selectedProduct.chain_count} רשתות</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-1.5 rounded-xl" style={{ background: 'rgba(79,72,63,0.1)', color: '#4F483F' }}>
                <X size={16} />
              </button>
            </div>

            {/* Edit name */}
            <div className="mb-4">
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>שם המוצר</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
                autoFocus
              />
            </div>

            {/* Edit search tags */}
            <div className="mb-5">
              <label className="text-xs font-semibold mb-1 block" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>תגיות חיפוש (מופרדות בפסיק)</label>
              <input
                type="text"
                placeholder="למשל: שמן, קנולה, בישול"
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
              />
              <p className="text-xs mt-1" style={{ color: '#B6AB9C' }}>תגיות אלו ישפרו את תוצאות החיפוש עבור מוצר זה</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
                style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
              >
                <Save size={15} />
                {saving ? 'שומר...' : 'שמור שינויים'}
              </button>
              <button
                onClick={handleDelete}
                disabled={saving || deleting}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
                style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C', border: '1.5px solid rgba(191,44,44,0.2)', fontFamily: 'Heebo, sans-serif' }}
              >
                <Trash2 size={15} />
                {deleting ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: Featured Items
// ═══════════════════════════════════════════════════════════════════════════════
function FeaturedTab() {
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeatured = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('featured_items')
      .select('*')
      .order('sort_order', { ascending: true });
    setFeaturedItems(data || []);
    setLoading(false);
  };

  useEffect(() => { loadFeatured(); }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchResults(await searchProducts(searchQuery));
      setSearching(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const addFeatured = async (product: SearchResult) => {
    if (featuredItems.some(f => f.item_code === product.item_code)) {
      toast('המוצר כבר מופיע ברשימה', { icon: 'ℹ️' });
      return;
    }
    setAddingItem(product.item_code);
    const maxOrder = featuredItems.length > 0 ? Math.max(...featuredItems.map(f => f.sort_order)) : 0;
    const { data, error } = await supabase
      .from('featured_items')
      .insert({ item_code: product.item_code, item_name: product.item_name, sort_order: maxOrder + 1, active: true })
      .select()
      .single();
    if (error) { toast.error('שגיאה בהוספה'); }
    else if (data) {
      setFeaturedItems(prev => [...prev, data]);
      toast.success(`"${product.item_name}" נוסף למוצרים מומלצים`);
      setSearchQuery('');
      setSearchResults([]);
    }
    setAddingItem(null);
  };

  const toggleActive = async (item: FeaturedItem) => {
    const { error } = await supabase
      .from('featured_items')
      .update({ active: !item.active })
      .eq('id', item.id);
    if (!error) {
      setFeaturedItems(prev => prev.map(f => f.id === item.id ? { ...f, active: !f.active } : f));
    }
  };

  const removeFeatured = async (item: FeaturedItem) => {
    if (!confirm(`להסיר את "${item.item_name}" מהמוצרים המומלצים?`)) return;
    const { error } = await supabase.from('featured_items').delete().eq('id', item.id);
    if (!error) {
      setFeaturedItems(prev => prev.filter(f => f.id !== item.id));
      toast.success('הוסר');
    }
  };

  const moveSortOrder = async (item: FeaturedItem, direction: 'up' | 'down') => {
    const idx = featuredItems.findIndex(f => f.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= featuredItems.length) return;

    const swapItem = featuredItems[swapIdx];
    const newOrder = [...featuredItems];
    // Swap sort_order values
    const tempOrder = item.sort_order;
    newOrder[idx] = { ...item, sort_order: swapItem.sort_order };
    newOrder[swapIdx] = { ...swapItem, sort_order: tempOrder };
    newOrder.sort((a, b) => a.sort_order - b.sort_order);
    setFeaturedItems(newOrder);

    // Persist both
    await Promise.all([
      supabase.from('featured_items').update({ sort_order: swapItem.sort_order }).eq('id', item.id),
      supabase.from('featured_items').update({ sort_order: tempOrder }).eq('id', swapItem.id),
    ]);
  };

  return (
    <div dir="rtl">
      {/* Search to add */}
      <div className="mb-5 rounded-2xl p-4" style={{ background: 'rgba(233,216,197,0.9)', border: '1.5px solid rgba(182,171,156,0.4)' }}>
        <p className="text-sm font-bold mb-3" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>הוסף מוצר מומלץ</p>
        <div className="relative mb-2">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: '#8a7f75' }} />
          <input
            type="text"
            placeholder="חפש מוצר להוספה..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(182,171,156,0.5)', color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}
          />
        </div>
        {(searching || searchResults.length > 0) && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(182,171,156,0.4)', background: 'rgba(255,255,255,0.85)' }}>
            {searching
              ? <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} /></div>
              : searchResults.map(p => {
                const alreadyAdded = featuredItems.some(f => f.item_code === p.item_code);
                const isAdding = addingItem === p.item_code;
                return (
                  <button
                    key={p.item_code}
                    onClick={() => addFeatured(p)}
                    disabled={isAdding || alreadyAdded}
                    className="w-full flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 text-right transition-colors hover:bg-black/5 disabled:opacity-60"
                    style={{ borderColor: 'rgba(182,171,156,0.2)' }}
                  >
                    <ProductThumb itemCode={p.item_code} name={p.item_name} unitInfo={formatUnitInfo(p)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>{p.item_name}</p>
                      <p className="text-xs" style={{ color: '#8a7f75' }}>{p.item_code} · ₪{p.min_price?.toFixed(2)}</p>
                    </div>
                    <div className="shrink-0">
                      {isAdding
                        ? <div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
                        : alreadyAdded
                        ? <CheckCircle2 size={20} style={{ color: '#2d7a2d' }} />
                        : <Plus size={20} style={{ color: '#BF2C2C' }} />}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Featured items list */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(182,171,156,0.4)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(233,216,197,0.95)', borderBottom: '1px solid rgba(182,171,156,0.3)' }}>
          <p className="text-sm font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
            מוצרים מומלצים ({featuredItems.filter(f => f.active).length} פעילים)
          </p>
          <p className="text-xs" style={{ color: '#8a7f75' }}>גרור לשינוי סדר</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8" style={{ background: 'rgba(255,255,255,0.6)' }}>
            <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
          </div>
        ) : featuredItems.length === 0 ? (
          <div className="py-12 text-center" style={{ background: 'rgba(255,255,255,0.6)' }}>
            <Star size={32} className="mx-auto mb-3 opacity-20" style={{ color: '#4F483F' }} />
            <p className="text-sm" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>אין מוצרים מומלצים עדיין</p>
            <p className="text-xs mt-1" style={{ color: '#B6AB9C' }}>חפש מוצרים למעלה והוסף אותם</p>
          </div>
        ) : (
          featuredItems.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0"
              style={{ borderColor: 'rgba(182,171,156,0.2)', background: item.active ? 'rgba(255,255,255,0.7)' : 'rgba(240,235,228,0.5)' }}
            >
              {/* Sort order controls */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => moveSortOrder(item, 'up')}
                  disabled={idx === 0}
                  className="p-0.5 rounded disabled:opacity-20 hover:opacity-60"
                  style={{ color: '#8a7f75' }}
                >
                  <GripVertical size={14} />
                </button>
              </div>

              {/* Sort number */}
              <span className="text-xs font-bold w-5 text-center shrink-0" style={{ color: '#B6AB9C' }}>{idx + 1}</span>

              <ProductThumb itemCode={item.item_code} name={item.item_name || item.item_code} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: item.active ? '#4F483F' : '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>
                  {item.item_name || item.item_code}
                </p>
                <p className="text-xs" style={{ color: '#B6AB9C' }}>{item.item_code}</p>
              </div>

              {/* Up/Down buttons */}
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => moveSortOrder(item, 'up')}
                  disabled={idx === 0}
                  className="px-2 py-1 rounded-lg text-xs font-bold disabled:opacity-20 hover:opacity-70"
                  style={{ background: 'rgba(182,171,156,0.2)', color: '#4F483F' }}
                >↑</button>
                <button
                  onClick={() => moveSortOrder(item, 'down')}
                  disabled={idx === featuredItems.length - 1}
                  className="px-2 py-1 rounded-lg text-xs font-bold disabled:opacity-20 hover:opacity-70"
                  style={{ background: 'rgba(182,171,156,0.2)', color: '#4F483F' }}
                >↓</button>
              </div>

              {/* Active toggle */}
              <button
                onClick={() => toggleActive(item)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: item.active ? 'rgba(45,122,45,0.12)' : 'rgba(182,171,156,0.2)',
                  color: item.active ? '#2d7a2d' : '#8a7f75',
                  border: item.active ? '1px solid rgba(45,122,45,0.3)' : '1px solid rgba(182,171,156,0.3)',
                }}
              >
                {item.active ? 'פעיל' : 'מושבת'}
              </button>

              {/* Remove */}
              <button
                onClick={() => removeFeatured(item)}
                className="shrink-0 p-1.5 rounded-lg hover:opacity-70"
                style={{ color: '#BF2C2C', background: 'rgba(191,44,44,0.08)' }}
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: Admin Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('groups');

  // Auth guard: only admin can access
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || user.email !== ADMIN_EMAIL) {
        router.replace('/');
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-5xl mx-auto px-3 md:px-4 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6" dir="rtl">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>⚙️ ניהול</h1>
          <p className="text-sm" style={{ color: '#8a7f75' }}>ברוך הבא, מנהל</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-6 flex-wrap" dir="rtl">
          <TabBtn
            active={activeTab === 'groups'}
            onClick={() => setActiveTab('groups')}
            icon={<Tag size={15} />}
            label="קבוצות מוצרים"
          />
          <TabBtn
            active={activeTab === 'products'}
            onClick={() => setActiveTab('products')}
            icon={<Pencil size={15} />}
            label="עריכת מוצרים"
          />
          <TabBtn
            active={activeTab === 'featured'}
            onClick={() => setActiveTab('featured')}
            icon={<Star size={15} />}
            label="מוצרים מומלצים"
          />
        </div>

        {/* Tab content */}
        <div className="rounded-3xl p-3 md:p-5" style={{ background: 'rgba(233,216,197,0.6)', border: '1.5px solid rgba(182,171,156,0.4)', backdropFilter: 'blur(8px)' }}>
          {activeTab === 'groups' && <GroupsTab />}
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'featured' && <FeaturedTab />}
        </div>
      </div>
    </div>
  );
}
