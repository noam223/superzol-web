'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, ArrowRight, Tag, MapPin, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { PRODUCTS_INDEX, IndexProduct, CHAIN_NAMES, isValidManufacturerName, formatUnitInfo, formatLastUpdated } from '@/lib/typesense';
import { addToHistory } from '@/lib/history';
import { getUserLocation, UserLocation } from '@/lib/location';

// ── Types ────────────────────────────────────────────────────────────────────

type ChainPrice = {
  chainId: string;
  chainName: string;
  price: number;
};

type NearbyStore = {
  store_key: string;
  chain_name: string;
  store_name: string;
  distance_km: number;
  total_price: number;
  effective_total?: number;
  items: {
    found: boolean;
    price: number | null;
    effective_price?: number | null;
    promotion_description?: string | null;
  }[];
};

type PriceHistoryRow = {
  date: string;
  chain_id: string;
  chain_name: string;
  price: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchProductFromIndex(itemCode: string): Promise<IndexProduct | null> {
  try {
    const params = new URLSearchParams({ collection: PRODUCTS_INDEX, doc_id: itemCode });
    const res = await fetch(`/api/search?${params}`);
    if (res.ok) return await res.json();
  } catch { /* skip */ }
  return null;
}

async function fetchPriceHistory(itemCode: string): Promise<PriceHistoryRow[]> {
  try {
    const res = await fetch(`/api/price-history?item_code=${encodeURIComponent(itemCode)}&days=60`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch {
    return [];
  }
}

async function fetchNearbyStorePrices(
  itemCode: string,
  itemName: string,
  loc: UserLocation
): Promise<NearbyStore[]> {
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: loc.lat,
        lng: loc.lng,
        radius_km: 15,
        items: [{ item_code: itemCode, item_name: itemName, quantity: 1 }],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.stores || []).filter((s: NearbyStore) => s.total_price > 0);
  } catch {
    return [];
  }
}

// ── Inline SVG Price History Chart ───────────────────────────────────────────

const CHART_COLORS = [
  '#BF2C2C', '#2d7a2d', '#1a6fa8', '#c47a00', '#7a2d7a',
  '#2d7a6f', '#8a4a00', '#4a2d7a',
];

function PriceHistoryChart({ history }: { history: PriceHistoryRow[] }) {
  if (history.length === 0) return null;

  const W = 340, H = 160, PAD = { top: 10, right: 10, bottom: 30, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Group by chain
  const chains = Array.from(new Set(history.map(r => r.chain_id)));
  const chainMap: Record<string, PriceHistoryRow[]> = {};
  for (const c of chains) chainMap[c] = history.filter(r => r.chain_id === c);

  // All dates (sorted)
  const allDates = Array.from(new Set(history.map(r => r.date))).sort();
  const allPrices = history.map(r => r.price);
  const minP = Math.min(...allPrices) * 0.95;
  const maxP = Math.max(...allPrices) * 1.05;

  const xScale = (i: number) => PAD.left + (i / Math.max(allDates.length - 1, 1)) * innerW;
  const yScale = (p: number) => PAD.top + innerH - ((p - minP) / (maxP - minP)) * innerH;

  // Y axis labels
  const yTicks = [minP, (minP + maxP) / 2, maxP];

  // X axis labels (first, middle, last)
  const xLabels = allDates.length > 1
    ? [allDates[0], allDates[Math.floor(allDates.length / 2)], allDates[allDates.length - 1]]
    : allDates;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
        {/* Grid lines */}
        {yTicks.map((p, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={yScale(p)} x2={W - PAD.right} y2={yScale(p)}
              stroke="rgba(182,171,156,0.3)" strokeWidth={1} strokeDasharray="4,3"
            />
            <text
              x={PAD.left - 4} y={yScale(p) + 4}
              textAnchor="end" fontSize={9} fill="#8a7f75"
            >
              ₪{p.toFixed(1)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map((d, i) => {
          const idx = allDates.indexOf(d);
          return (
            <text
              key={i}
              x={xScale(idx)} y={H - 4}
              textAnchor="middle" fontSize={8} fill="#8a7f75"
            >
              {d.slice(5)} {/* MM-DD */}
            </text>
          );
        })}

        {/* Lines per chain */}
        {chains.map((chainId, ci) => {
          const rows = chainMap[chainId];
          const color = CHART_COLORS[ci % CHART_COLORS.length];
          const points = rows
            .map(r => {
              const xi = allDates.indexOf(r.date);
              return `${xScale(xi)},${yScale(r.price)}`;
            })
            .join(' ');

          return (
            <g key={chainId}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {rows.map((r, ri) => {
                const xi = allDates.indexOf(r.date);
                return (
                  <circle
                    key={ri}
                    cx={xScale(xi)} cy={yScale(r.price)}
                    r={3} fill={color}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {chains.map((chainId, ci) => (
          <div key={chainId} className="flex items-center gap-1">
            <div style={{ width: 12, height: 3, borderRadius: 2, background: CHART_COLORS[ci % CHART_COLORS.length] }} />
            <span style={{ fontSize: 10, color: '#8a7f75' }}>
              {CHAIN_NAMES[chainId] || chainId}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductPage() {
  const params = useParams();
  const itemCode = params.itemCode as string;

  const [product, setProduct] = useState<IndexProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgSrc, setImgSrc] = useState(getProductImageUrl(itemCode));

  // Chain-level prices (existing)
  const [chainPrices, setChainPrices] = useState<ChainPrice[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);

  // Price history
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Nearby store prices
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  // Load product + history + location in parallel
  useEffect(() => {
    setImgSrc(getProductImageUrl(itemCode));

    // Product info
    fetchProductFromIndex(itemCode).then((p) => {
      setProduct(p);
      setLoading(false);
      if (p) addToHistory({ item_code: p.item_code, item_name: p.item_name, min_price: p.min_price });
    });

    // Price history
    setHistoryLoading(true);
    fetchPriceHistory(itemCode).then(h => {
      setPriceHistory(h);
      setHistoryLoading(false);
    });

    // User location (for nearby stores)
    getUserLocation().then(loc => setUserLocation(loc));
  }, [itemCode]);

  // Fetch nearby store prices once we have both product and location
  const loadNearbyStores = useCallback(async (p: IndexProduct, loc: UserLocation) => {
    setNearbyLoading(true);
    const stores = await fetchNearbyStorePrices(itemCode, p.item_name, loc);
    setNearbyStores(stores);
    setNearbyLoading(false);
  }, [itemCode]);

  useEffect(() => {
    if (product && userLocation) {
      loadNearbyStores(product, userLocation);
    }
  }, [product, userLocation, loadNearbyStores]);

  // Fetch chain-level prices (existing behaviour)
  useEffect(() => {
    setPricesLoading(true);
    import('@/lib/typesense').then(({ getProductPrices }) => {
      getProductPrices(itemCode).then((results) => {
        const prices: ChainPrice[] = (results as Array<{ chainId: string; chainName: string; hits: Array<{ document: Record<string, unknown> }> }>)
          .map((r) => {
            const ps = r.hits.map((h) => Number(h.document.item_price)).filter((p) => p > 0);
            if (ps.length === 0) return null;
            return { chainId: r.chainId, chainName: CHAIN_NAMES[r.chainId] || r.chainName, price: Math.min(...ps) };
          })
          .filter(Boolean) as ChainPrice[];
        prices.sort((a, b) => a.price - b.price);
        setChainPrices(prices);
        setPricesLoading(false);
      });
    });
  }, [itemCode]);

  const handleAddToList = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('התחבר כדי לשמור'); return; }
    await supabase.from('shopping_list_items').insert({
      user_id: user.id, item_code: itemCode,
      item_name: product?.item_name || itemCode, quantity: 1, checked: false,
    });
    toast.success('נוסף לרשימת קניות');
  };

  const savings = chainPrices.length > 1
    ? chainPrices[chainPrices.length - 1].price - chainPrices[0].price
    : (product?.max_price && product?.min_price ? product.max_price - product.min_price : 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Back */}
        <Link href="/search" className="flex items-center gap-2 mb-6 text-sm font-medium" style={{ color: '#4F483F' }}>
          <ArrowRight size={16} />
          חזרה לחיפוש
        </Link>

        {loading ? (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
            טוען...
          </div>
        ) : !product ? (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <p className="text-lg font-medium">מוצר לא נמצא</p>
            <p className="text-sm mt-1">ברקוד: {itemCode}</p>
          </div>
        ) : (
          <>
            {/* ── Header card ── */}
            <div className="rounded-3xl p-5 mb-5 flex items-start gap-4"
              style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt={product.item_name}
                onError={() => { if (imgSrc === getProductImageUrl(itemCode)) setImgSrc(getProductImageFallback(itemCode)); }}
                style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 16, background: 'white', flexShrink: 0 }}
              />
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold mb-1" style={{ color: '#4F483F' }}>{product.item_name}</h1>
                {isValidManufacturerName(product.manufacturer_name) && (
                  <p className="text-xs mb-1" style={{ color: '#8a7f75' }}>{product.manufacturer_name}</p>
                )}
                {formatUnitInfo(product) && (
                  <p className="text-xs mb-1" style={{ color: '#8a7f75' }}>
                    {formatUnitInfo(product)}
                  </p>
                )}
                <p className="text-xs mb-1" style={{ color: '#B6AB9C' }}>ברקוד: {itemCode}</p>
                {formatLastUpdated(product.last_updated) && (
                  <p className="text-xs mb-3" style={{ color: '#B6AB9C' }}>
                    🕐 {formatLastUpdated(product.last_updated)}
                  </p>
                )}
                <button onClick={handleAddToList}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium"
                  style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}>
                  <ShoppingCart size={15} />
                  הוסף לרשימה
                </button>
              </div>
            </div>

            {/* ── Savings banner ── */}
            {savings > 0.5 && (
              <div className="rounded-2xl p-3 mb-5 text-sm font-medium"
                style={{ background: 'rgba(45, 122, 45, 0.12)', border: '1px solid rgba(45, 122, 45, 0.2)', color: '#2d7a2d' }}>
                💰 חיסכון פוטנציאלי: <strong>₪{savings.toFixed(2)}</strong> בין הרשת הזולה לרשת היקרה
              </div>
            )}

            {/* ── Nearby store prices ── */}
            <div className="rounded-3xl p-5 mb-5"
              style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}>
              <div className="flex items-center gap-2 mb-4">
                <MapPin size={16} style={{ color: '#BF2C2C' }} />
                <h2 className="font-bold" style={{ color: '#4F483F', fontSize: 16 }}>
                  מחירים בחנויות קרובות
                </h2>
                {userLocation && (
                  <span className="text-xs mr-auto" style={{ color: '#8a7f75' }}>
                    {userLocation.label}
                  </span>
                )}
              </div>

              {!userLocation ? (
                <div className="text-sm py-3 text-center" style={{ color: '#8a7f75' }}>
                  <MapPin size={20} className="mx-auto mb-2 opacity-40" />
                  <p>הגדר מיקום כדי לראות מחירים בחנויות קרובות</p>
                  <button
                    onClick={() => {
                      // Trigger location prompt by clearing saved location
                      try { localStorage.removeItem('superzol_location'); } catch { /* skip */ }
                      window.location.reload();
                    }}
                    className="mt-2 text-xs px-3 py-1.5 rounded-xl font-medium"
                    style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C' }}
                  >
                    הגדר מיקום
                  </button>
                </div>
              ) : nearbyLoading ? (
                <div className="flex items-center gap-2 py-4" style={{ color: '#8a7f75' }}>
                  <div className="animate-spin w-5 h-5 border-2 rounded-full shrink-0" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
                  <span className="text-sm">מחפש בחנויות קרובות...</span>
                </div>
              ) : nearbyStores.length === 0 ? (
                <p className="text-sm py-2" style={{ color: '#8a7f75' }}>המוצר לא נמצא בחנויות קרובות (רדיוס 15 ק&quot;מ)</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {nearbyStores.slice(0, 8).map((store, i) => {
                    const isCheapest = i === 0;
                    const isMostExpensive = i === nearbyStores.length - 1 && nearbyStores.length > 1;
                    return (
                      <div key={store.store_key}
                        className="flex items-center justify-between p-3 rounded-2xl"
                        style={{
                          background: isCheapest ? 'rgba(45,122,45,0.1)' : isMostExpensive ? 'rgba(191,44,44,0.06)' : 'rgba(255,255,255,0.6)',
                          border: isCheapest ? '1.5px solid rgba(45,122,45,0.3)' : '1px solid rgba(182,171,156,0.3)',
                        }}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {isCheapest && (
                              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">הכי זול</span>
                            )}
                            <p className="font-semibold text-sm" style={{ color: '#4F483F' }}>{store.store_name}</p>
                          </div>
                          <p className="text-xs" style={{ color: '#8a7f75' }}>
                            {store.chain_name} · {store.distance_km.toFixed(1)} ק&quot;מ
                          </p>
                          {/* מבצע — תיאור + מחיר אפקטיבי */}
                          {store.items[0]?.promotion_description && (
                            <p className="text-xs font-medium mt-0.5" style={{ color: '#c47a00' }}>
                              🏷️ {store.items[0].promotion_description}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {store.items[0]?.effective_price != null &&
                           store.items[0].effective_price < (store.items[0].price ?? Infinity) ? (
                            <>
                              <p className="text-base font-bold" style={{ color: '#2d7a2d' }}>
                                ₪{store.items[0].effective_price.toFixed(2)}
                              </p>
                              <p className="text-xs line-through" style={{ color: '#B6AB9C' }}>
                                ₪{store.total_price.toFixed(2)}
                              </p>
                            </>
                          ) : (
                            <span className="text-base font-bold"
                              style={{ color: isCheapest ? '#2d7a2d' : isMostExpensive ? '#BF2C2C' : '#4F483F' }}>
                              ₪{store.total_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Price history chart ── */}
            <div className="rounded-3xl p-5 mb-5"
              style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown size={16} style={{ color: '#2d7a2d' }} />
                <h2 className="font-bold" style={{ color: '#4F483F', fontSize: 16 }}>היסטוריית מחירים (60 יום)</h2>
              </div>

              {historyLoading ? (
                <div className="flex items-center gap-2 py-4" style={{ color: '#8a7f75' }}>
                  <div className="animate-spin w-5 h-5 border-2 rounded-full shrink-0" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
                  <span className="text-sm">טוען היסטוריה...</span>
                </div>
              ) : priceHistory.length === 0 ? (
                <p className="text-sm py-2 text-center" style={{ color: '#8a7f75' }}>
                  אין נתוני היסטוריה עדיין — יצטברו לאחר העלאות מחירים
                </p>
              ) : (
                <PriceHistoryChart history={priceHistory} />
              )}
            </div>

            {/* ── Chain-level price comparison ── */}
            <div className="rounded-3xl p-5 mb-5"
              style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}>
              <h2 className="font-bold mb-4" style={{ color: '#4F483F', fontSize: 16 }}>השוואת מחירים לפי רשת</h2>

              {pricesLoading ? (
                <div className="flex items-center gap-2 py-4" style={{ color: '#8a7f75' }}>
                  <div className="animate-spin w-5 h-5 border-2 rounded-full shrink-0" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
                  <span className="text-sm">מחפש מחירים בכל הרשתות...</span>
                </div>
              ) : chainPrices.length === 0 ? (
                <p className="text-sm py-2" style={{ color: '#8a7f75' }}>המוצר לא נמצא ברשתות</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {chainPrices.map((cp, i) => {
                    const isCheapest = i === 0;
                    const isMostExpensive = i === chainPrices.length - 1 && chainPrices.length > 1;
                    return (
                      <div key={cp.chainId}
                        className="flex items-center justify-between p-3 rounded-2xl"
                        style={{
                          background: isCheapest ? 'rgba(45,122,45,0.1)' : isMostExpensive ? 'rgba(191,44,44,0.06)' : 'rgba(255,255,255,0.6)',
                          border: isCheapest ? '1.5px solid rgba(45,122,45,0.3)' : '1px solid rgba(182,171,156,0.3)',
                        }}>
                        <div className="flex items-center gap-2">
                          {isCheapest && (
                            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">הכי זול</span>
                          )}
                          <p className="font-semibold text-sm" style={{ color: '#4F483F' }}>{cp.chainName}</p>
                        </div>
                        <span className="text-base font-bold"
                          style={{ color: isCheapest ? '#2d7a2d' : isMostExpensive ? '#BF2C2C' : '#4F483F' }}>
                          ₪{cp.price.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Extra info card ── */}
            <div className="rounded-3xl p-5"
              style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}>
              <h2 className="font-bold mb-4" style={{ color: '#4F483F', fontSize: 16 }}>פרטים נוספים</h2>
              <div className="flex flex-col gap-2">
                {product.chain_count > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(182,171,156,0.3)' }}>
                    <p className="text-sm" style={{ color: '#8a7f75' }}>זמין ב</p>
                    <span className="text-sm font-semibold" style={{ color: '#4F483F' }}>{product.chain_count} רשתות</span>
                  </div>
                )}
                {product.has_promotion && product.promo_price && (
                  <div className="flex items-center justify-between p-3 rounded-2xl"
                    style={{ background: 'rgba(191,44,44,0.08)', border: '1px solid rgba(191,44,44,0.2)' }}>
                    <div className="flex items-center gap-2">
                      <Tag size={14} style={{ color: '#BF2C2C' }} />
                      <p className="text-sm font-medium" style={{ color: '#BF2C2C' }}>
                        {product.promo_description || 'מבצע'}
                      </p>
                    </div>
                    <span className="text-base font-bold" style={{ color: '#BF2C2C' }}>
                      ₪{product.promo_price.toFixed(2)}
                    </span>
                  </div>
                )}
                {(product.unit_qty || product.unit_of_measure) && (
                  <p className="text-xs mt-2" style={{ color: '#B6AB9C' }}>
                    {product.unit_qty} {product.unit_of_measure}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
