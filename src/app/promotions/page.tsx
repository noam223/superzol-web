'use client';

import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { searchProductsIndex, IndexProduct } from '@/lib/typesense';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import Link from 'next/link';

function ProductImage({ itemCode, name }: { itemCode: string; name: string }) {
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
          width: 56, height: 56,
          background: 'linear-gradient(135deg, #f0e8e0, #e8ddd5)',
          borderRadius: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22, flexShrink: 0,
        }}
      >🔥</div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={name} onError={handleError}
      style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, flexShrink: 0, background: '#f8f4f0' }}
    />
  );
}

export default function PromotionsPage() {
  const [promos, setPromos] = useState<IndexProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPromos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPromos = async () => {
    setLoading(true);
    try {
      const { hits } = await searchProductsIndex('*', {
        perPage: 100,
        onlyPromos: true,
      });
      setPromos(hits);
    } catch {
      setPromos([]);
    }
    setLoading(false);
  };

  const savingsPct = (p: IndexProduct) => {
    if (!p.promo_price || !p.min_price || p.min_price <= 0) return 0;
    return Math.round(((p.min_price - p.promo_price) / p.min_price) * 100);
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
            style={{ background: 'rgba(191, 44, 44, 0.12)' }}
          >
            🔥
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>מבצעים</h1>
            <p className="text-xs" style={{ color: '#8a7f75' }}>כל המבצעים הפעילים מכל הרשתות</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16 gap-3" style={{ color: '#8a7f75' }}>
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
            <span className="text-sm">טוען מבצעים...</span>
          </div>
        ) : promos.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <Tag size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">אין מבצעים כרגע</p>
          </div>
        ) : (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: '#8a7f75' }}>
              {promos.length} מבצעים פעילים
            </p>
            <div className="flex flex-col gap-3">
              {promos.map((promo) => {
                const pct = savingsPct(promo);
                return (
                  <Link
                    key={promo.item_code}
                    href={`/product/${promo.item_code}`}
                    className="flex gap-3 p-3 rounded-2xl"
                    style={{
                      background: 'rgba(233, 216, 197, 0.85)',
                      border: '1.5px solid rgba(182, 171, 156, 0.4)',
                    }}
                  >
                    {/* Image */}
                    <ProductImage itemCode={promo.item_code} name={promo.item_name} />

                    {/* Info */}
                    <div className="flex flex-col flex-1 min-w-0 gap-1">
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2" style={{ color: '#4F483F' }}>
                        {promo.item_name}
                      </h3>

                      {promo.promo_description && (
                        <p
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ background: 'rgba(191, 44, 44, 0.08)', color: '#BF2C2C' }}
                        >
                          {promo.promo_description}
                        </p>
                      )}

                      {/* Prices */}
                      <div className="flex items-baseline gap-2 mt-auto">
                        <span className="text-base font-bold" style={{ color: '#BF2C2C' }}>
                          ₪{(promo.promo_price ?? promo.min_price).toFixed(2)}
                        </span>
                        {promo.promo_price && promo.min_price > promo.promo_price && (
                          <span className="text-xs line-through" style={{ color: '#aaa' }}>
                            ₪{promo.min_price.toFixed(2)}
                          </span>
                        )}
                        {pct > 0 && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full font-bold mr-auto"
                            style={{ background: '#BF2C2C', color: 'white' }}
                          >
                            -{pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
