'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, ChevronLeft, ScanBarcode, ShoppingCart } from 'lucide-react';
import { searchProductsIndex, fetchAllGroupItemCodes, isValidManufacturerName, formatUnitInfo, getProductByItemCode, IndexProduct, formatLastUpdated } from '@/lib/typesense';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────
type ProductGroup = {
  id: string;
  name: string;
  image_item_code: string | null;
};

// ── Product image with local-first + CDN fallback ────────────────────────────
function ProductImage({ itemCode, name, size = 64 }: { itemCode: string; name: string; size?: number }) {
  const [src, setSrc] = useState(() => itemCode ? getProductImageUrl(itemCode) : '');
  const [failed, setFailed] = useState(!itemCode);

  const handleError = () => {
    if (itemCode && src === getProductImageUrl(itemCode)) {
      setSrc(getProductImageFallback(itemCode));
    } else {
      setFailed(true);
    }
  };

  if (failed || !itemCode) {
    return (
      <div
        style={{
          width: size, height: size,
          background: 'linear-gradient(135deg, #f0e8e0, #e8ddd5)',
          borderRadius: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: size * 0.4, flexShrink: 0,
        }}
      >🛒</div>
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

// ── Group card ───────────────────────────────────────────────────────────────
function GroupCard({ group, onAdd }: { group: ProductGroup; onAdd: (group: ProductGroup) => void }) {
  return (
    <div
      className="flex gap-3 p-3 rounded-2xl items-center"
      style={{
        background: 'rgba(191, 44, 44, 0.08)',
        border: '1.5px solid rgba(191, 44, 44, 0.3)',
      }}
    >
      {/* Group image */}
      <ProductImage
        itemCode={group.image_item_code || ''}
        name={group.name}
        size={64}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'rgba(191, 44, 44, 0.15)', color: '#BF2C2C' }}
          >
            📦 קבוצה
          </span>
        </div>
        <h3 className="font-bold text-sm leading-snug" style={{ color: '#4F483F' }}>
          {group.name}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>
          מוצר חכם · ישווה מחירים בין רשתות
        </p>
      </div>

      {/* Add to list button */}
      <button
        onClick={() => onAdd(group)}
        className="flex items-center justify-center rounded-xl shrink-0 font-bold transition-opacity hover:opacity-70 active:opacity-50"
        style={{ width: 40, height: 40, background: 'rgba(191, 44, 44, 0.12)', color: '#BF2C2C' }}
        title="הוסף לרשימת קניות"
      >
        <ShoppingCart size={17} />
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IndexProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [found, setFound] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupItemCodesRef = useRef<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);

  // All groups loaded once on mount
  const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
  const [matchingGroups, setMatchingGroups] = useState<ProductGroup[]>([]);

  // Load group item codes + all groups on mount
  useEffect(() => {
    fetchAllGroupItemCodes().then(codes => {
      groupItemCodesRef.current = codes;
    });

    supabase
      .from('product_groups')
      .select('id, name, image_item_code')
      .then(({ data }) => {
        if (data) setAllGroups(data as ProductGroup[]);
      });
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setMatchingGroups([]);
      setSearched(false);
      setFound(0);
      return;
    }
    setLoading(true);
    setSearched(true);

    // Filter groups by name (client-side, case-insensitive)
    const qLower = q.toLowerCase();
    const matched = allGroups.filter(g =>
      g.name.toLowerCase().includes(qLower) ||
      qLower.split(/\s+/).some(word => word.length >= 2 && g.name.includes(word))
    );
    setMatchingGroups(matched);

    try {
      const { hits, found } = await searchProductsIndex(q, { perPage: 30, groupItemCodes: groupItemCodesRef.current });
      setResults(hits);
      setFound(found);
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בחיפוש');
    } finally {
      setLoading(false);
    }
  }, [allGroups]);

  // Debounce: search 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, handleSearch]);

  const handleBarcodeScan = useCallback(async (code: string) => {
    setShowScanner(false);
    setLoading(true);
    setSearched(true);
    setQuery(code);

    try {
      // Direct lookup by item_code (barcode) — much more reliable than text search
      const product = await getProductByItemCode(code);
      if (product) {
        setResults([product]);
        setFound(1);
        setMatchingGroups([]);
        toast.success(`נמצא: ${product.item_name}`, { duration: 2500 });
      } else {
        // Fallback: text search with the barcode number
        const { hits, found } = await searchProductsIndex(code, { perPage: 10, groupItemCodes: groupItemCodesRef.current });
        setResults(hits);
        setFound(found);
        setMatchingGroups([]);
        if (hits.length === 0) {
          toast.error(`מוצר לא נמצא עבור ברקוד ${code}`, { duration: 3000 });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בחיפוש');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddToList = async (product: IndexProduct) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('התחבר כדי לשמור לרשימת קניות');
      return;
    }
    const { error } = await supabase.from('shopping_list_items').insert({
      user_id: user.id,
      item_code: product.item_code,
      item_name: product.item_name,
      quantity: 1,
      checked: false,
    });
    if (error) toast.error('שגיאה בהוספה לרשימה');
    else toast.success(`${product.item_name} נוסף לרשימה`);
  };

  const handleAddGroupToList = async (group: ProductGroup) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('התחבר כדי לשמור לרשימת קניות');
      return;
    }
    // Insert group as a shopping list item with group_id
    const { error } = await supabase.from('shopping_list_items').insert({
      user_id: user.id,
      item_code: 'group',
      item_name: group.name,
      quantity: 1,
      checked: false,
      group_id: group.id,
    });
    if (error) toast.error('שגיאה בהוספה לרשימה');
    else toast.success(`📦 ${group.name} נוסף לרשימה`);
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Search bar */}
        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2" size={18} style={{ color: '#8a7f75' }} />
            <input
              type="text"
              placeholder="חפש מוצר... (חלב, לחם, קוטג׳)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pr-10 pl-10 py-3 rounded-2xl text-base outline-none"
              style={{
                background: 'rgba(233, 216, 197, 0.9)',
                border: '1.5px solid rgba(182, 171, 156, 0.5)',
                color: '#4F483F',
                fontFamily: 'Heebo, sans-serif',
              }}
              autoFocus
            />
            {query ? (
              <button
                onClick={() => { setQuery(''); setResults([]); setMatchingGroups([]); setSearched(false); setFound(0); }}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#8a7f75' }}
              >
                <X size={16} />
              </button>
            ) : (
              <button
                onClick={() => setShowScanner(true)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: '#BF2C2C' }}
                title="סרוק ברקוד"
              >
                <ScanBarcode size={18} />
              </button>
            )}
          </div>
          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center px-3">
              <div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>

        {/* Barcode scanner overlay */}
        {showScanner && (
          <BarcodeScanner
            title="סרוק ברקוד מוצר"
            onScan={handleBarcodeScan}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* Loading skeleton */}
        {loading && results.length === 0 && matchingGroups.length === 0 && (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="flex gap-3 p-3 rounded-2xl animate-pulse" style={{ background: 'rgba(233, 216, 197, 0.6)' }}>
                <div className="w-16 h-16 rounded-xl shrink-0" style={{ background: 'rgba(182, 171, 156, 0.4)' }} />
                <div className="flex flex-col flex-1 gap-2 justify-center">
                  <div className="h-3 rounded-full w-3/4" style={{ background: 'rgba(182, 171, 156, 0.4)' }} />
                  <div className="h-3 rounded-full w-1/2" style={{ background: 'rgba(182, 171, 156, 0.3)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && searched && results.length === 0 && matchingGroups.length === 0 && (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <Search size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">לא נמצאו תוצאות עבור &quot;{query}&quot;</p>
            <p className="text-sm mt-1">נסה מילה אחרת</p>
          </div>
        )}

        {/* ── Group results (top section) ── */}
        {matchingGroups.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold mb-2" style={{ color: '#BF2C2C' }}>
              📦 קבוצות מוצרים
            </p>
            <div className="flex flex-col gap-2">
              {matchingGroups.map(group => (
                <GroupCard key={group.id} group={group} onAdd={handleAddGroupToList} />
              ))}
            </div>
          </div>
        )}

        {/* ── Regular product results ── */}
        {!loading && results.length > 0 && (
          <>
            {matchingGroups.length > 0 && (
              <p className="text-xs font-bold mb-2 mt-4" style={{ color: '#8a7f75' }}>
                🔍 מוצרים בודדים
              </p>
            )}
            {!matchingGroups.length && (
              <p className="text-xs mb-3 font-medium" style={{ color: '#8a7f75' }}>
                נמצאו {found.toLocaleString()} מוצרים עבור &quot;{query}&quot;
              </p>
            )}
            <div className="flex flex-col gap-3">
              {results.map((product) => {
                return (
                <div
                  key={product.item_code}
                  className="flex gap-3 p-3 rounded-2xl"
                  style={{
                    background: 'rgba(233, 216, 197, 0.85)',
                    border: '1.5px solid rgba(182, 171, 156, 0.4)',
                  }}
                >
                  {/* Image */}
                  <Link href={`/product/${product.item_code}`} className="shrink-0">
                    <ProductImage itemCode={product.item_code} name={product.item_name} size={72} />
                  </Link>

                  {/* Info */}
                  <div className="flex flex-col flex-1 min-w-0 gap-1">
                    <Link href={`/product/${product.item_code}`}>
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2" style={{ color: '#4F483F' }}>
                        {product.item_name}
                      </h3>
                    </Link>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isValidManufacturerName(product.manufacturer_name) && (
                        <p className="text-xs" style={{ color: '#8a7f75' }}>{product.manufacturer_name}</p>
                      )}
                      {formatUnitInfo(product) && (
                        <p className="text-xs" style={{ color: '#8a7f75' }}>
                          {formatUnitInfo(product)}
                        </p>
                      )}
                      {formatLastUpdated(product.last_updated) && (
                        <p className="text-xs" style={{ color: '#B6AB9C' }}>
                          🕐 {formatLastUpdated(product.last_updated)}
                        </p>
                      )}
                    </div>

                    {/* Price row */}
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold" style={{ color: '#2d7a2d' }}>
                          ₪{product.min_price.toFixed(2)}
                        </span>
                        {product.max_price && product.max_price > product.min_price && (
                          <span className="text-xs" style={{ color: '#aaa' }}>
                            עד ₪{product.max_price.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Chain count badge */}
                      {product.chain_count > 1 && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(45, 122, 45, 0.1)', color: '#2d7a2d' }}
                        >
                          {product.chain_count} רשתות
                        </span>
                      )}
                    </div>

                    {/* Promo */}
                    {product.has_promotion && product.promo_price && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full self-start font-medium"
                        style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C' }}
                      >
                        🔥 מבצע ₪{product.promo_price.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <Link
                      href={`/product/${product.item_code}`}
                      className="p-2 rounded-xl"
                      style={{ background: 'rgba(79, 72, 63, 0.08)', color: '#4F483F' }}
                      title="השוואת מחירים"
                    >
                      <ChevronLeft size={16} />
                    </Link>
                    <button
                      onClick={() => handleAddToList(product)}
                      className="p-2 rounded-xl text-xs font-bold"
                      style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C' }}
                      title="הוסף לרשימה"
                    >
                      +
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!searched && !loading && (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <Search size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">הקלד שם מוצר לחיפוש</p>
            <p className="text-sm mt-1">למשל: חלב תנובה, לחם אחיד, קוטג׳ 5%</p>
          </div>
        )}
      </div>
    </div>
  );
}
