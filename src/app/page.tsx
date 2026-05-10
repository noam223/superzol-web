'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';

type PromoItem = {
  id: string;
  item_code: string;
  item_name: string;
  min_price: number;
  promo_price?: number;
  promo_description?: string;
  cheapest_chain_name?: string;
};

// Product image with local-first + CDN fallback
function ProductImage({
  itemCode,
  name,
  size = 110,
}: {
  itemCode: string;
  name: string;
  size?: number;
}) {
  const [src, setSrc] = useState(getProductImageUrl(itemCode));
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    if (src === getProductImageUrl(itemCode)) {
      setSrc(getProductImageFallback(itemCode));
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #f0e8e0, #e8ddd5)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}
      >
        🛒
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={handleError}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        borderRadius: 16,
      }}
    />
  );
}

// Infinite auto-scroll carousel
function AutoCarousel({ children }: { children: React.ReactNode[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const doubled = [...children, ...children];

  return (
    <div className="carousel-wrapper" style={{ paddingBottom: 4 }}>
      <div ref={trackRef} className="carousel-track">
        {doubled.map((child, i) => (
          <div key={i}>{child}</div>
        ))}
      </div>
    </div>
  );
}

// Skeleton placeholder cards
function SkeletonCards({ count, width, height }: { count: number; width: number; height: number }) {
  return (
    <div className="flex gap-3 px-4 overflow-hidden">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="skeleton" style={{ width, height, flexShrink: 0, borderRadius: 16 }} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [hotDeals, setHotDeals] = useState<PromoItem[]>([]);
  const [allPromos, setAllPromos] = useState<PromoItem[]>([]);
  const [featuredItems, setFeaturedItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Single API call to our server-side route (cached 5 min)
    fetch('/api/home-deals')
      .then((r) => r.json())
      .then(({ hotDeals, allPromos, featuredItems }) => {
        setHotDeals(hotDeals || []);
        setAllPromos(allPromos || []);
        setFeaturedItems(featuredItems || []);
      })
      .catch(() => {
        // silently fail — show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="min-h-screen pb-28"
      style={{
        background: `url('/icons/background.jpg') center/cover fixed`,
        backgroundColor: '#DAD1CA',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="flex justify-center pt-10 pb-2 animate-logo-drop">
        <Image
          src="/icons/logo.png"
          alt="סופרזול"
          width={160}
          height={80}
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      {/* ── Featured / Pinned Items Section ──────────────── */}
      {(loading || featuredItems.length > 0) && (
        <section className="mt-4 px-4">
          <div className="flex items-center justify-between mb-3">
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#4F483F',
                fontFamily: 'Rubik, Heebo, sans-serif',
              }}
            >
              ⭐ מוצרים מומלצים
            </h2>
          </div>

          {loading ? (
            <SkeletonCards count={3} width={130} height={160} />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {featuredItems.map((item) => (
                <Link
                  key={item.item_code}
                  href={`/product/${item.item_code}`}
                  className="flex flex-col items-center shrink-0 p-3 rounded-2xl"
                  style={{
                    background: 'rgba(233, 216, 197, 0.9)',
                    border: '1.5px solid rgba(191, 44, 44, 0.25)',
                    minWidth: 120,
                  }}
                >
                  <ProductImage itemCode={item.item_code} name={item.item_name} size={90} />
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#4F483F',
                      textAlign: 'center',
                      marginTop: 6,
                      lineHeight: 1.3,
                      maxWidth: 110,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.item_name}
                  </p>
                  {item.min_price > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#2d7a2d', marginTop: 4 }}>
                      ₪{item.min_price.toFixed(2)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Hot Deals Section ─────────────────────────────── */}
      <section className="mt-4">
        {/* Title row with animated fire icons */}
        <div className="flex items-center justify-center gap-2 mb-3 px-4">
          <Image
            src="/icons/fire_small.png"
            alt="🔥"
            width={26}
            height={26}
            className="animate-fire"
            style={{ animationDelay: '0s' }}
          />
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#4F483F',
              fontFamily: 'Rubik, Heebo, sans-serif',
              letterSpacing: -0.3,
            }}
          >
            מבצעים חמים
          </h2>
          <Image
            src="/icons/fire_small.png"
            alt="🔥"
            width={26}
            height={26}
            className="animate-fire"
            style={{ animationDelay: '0.3s' }}
          />
        </div>

        {/* Hot deals carousel */}
        {loading ? (
          <SkeletonCards count={5} width={130} height={160} />
        ) : hotDeals.length > 0 ? (
          <AutoCarousel>
            {hotDeals.map((item, i) => (
              <Link
                key={item.id || item.item_code}
                href={`/product/${item.item_code}`}
                className={`product-card-hot animate-slide-up-${Math.min(i + 1, 6)}`}
              >
                <ProductImage itemCode={item.item_code} name={item.item_name} size={110} />
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#BF2C2C',
                    textAlign: 'center',
                    marginTop: 6,
                    lineHeight: 1.3,
                    maxWidth: 110,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {item.item_name}
                </p>
                {item.promo_price != null && item.min_price > 0 ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#2d7a2d' }}>
                      ₪{item.promo_price.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: '#999', textDecoration: 'line-through' }}>
                      ₪{item.min_price.toFixed(2)}
                    </span>
                  </div>
                ) : item.min_price > 0 ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#2d7a2d' }}>
                      ₪{item.min_price.toFixed(2)}
                    </span>
                  </div>
                ) : null}
              </Link>
            ))}
          </AutoCarousel>
        ) : (
          <p className="text-center text-sm py-4" style={{ color: '#8a7f75' }}>
            אין מבצעים כרגע
          </p>
        )}

        {/* CTA button */}
        <div className="flex justify-center mt-5">
          <Link href="/promotions" className="btn-beige text-sm">
            צפה בכל המבצעים החמים
          </Link>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────── */}
      <div
        style={{
          height: 2,
          background: 'rgba(214, 205, 190, 0.71)',
          margin: '20px 48px',
          borderRadius: 2,
        }}
      />

      {/* ── All Promotions Section ────────────────────────── */}
      <section className="mt-2">
        <div className="flex items-center justify-center mb-3 px-4">
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#4F483F',
              fontFamily: 'Rubik, Heebo, sans-serif',
            }}
          >
            כל המבצעים
          </h2>
        </div>

        {/* All promos carousel — smaller cards */}
        {loading ? (
          <SkeletonCards count={6} width={100} height={100} />
        ) : allPromos.length > 0 ? (
          <AutoCarousel>
            {allPromos.map((item) => (
              <Link
                key={item.id || item.item_code}
                href={`/product/${item.item_code}`}
                className="product-card-promo"
              >
                <ProductImage itemCode={item.item_code} name={item.item_name} size={100} />
              </Link>
            ))}
          </AutoCarousel>
        ) : (
          <p className="text-center text-sm py-4" style={{ color: '#8a7f75' }}>
            אין מבצעים כרגע
          </p>
        )}

        {/* CTA button */}
        <div className="flex justify-center mt-4">
          <Link
            href="/promotions"
            className="btn-beige"
            style={{ fontSize: 13, paddingTop: 6, paddingBottom: 6 }}
          >
            צפה בכל המבצעים
          </Link>
        </div>
      </section>

      {/* ── Quick action cards ────────────────────────────── */}
      <section className="px-4 mt-8">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/search"
            className="animate-slide-up-1 flex flex-col items-center gap-2 py-5 rounded-3xl"
            style={{
              background: 'rgba(233, 216, 197, 0.75)',
              border: '1.5px solid rgba(182, 171, 156, 0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Image src="/icons/search.png" alt="חיפוש" width={44} height={44} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4F483F' }}>חיפוש מוצרים</span>
          </Link>

          <Link
            href="/compare"
            className="animate-slide-up-2 flex flex-col items-center gap-2 py-5 rounded-3xl"
            style={{
              background: 'rgba(233, 216, 197, 0.75)',
              border: '1.5px solid rgba(182, 171, 156, 0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Image src="/icons/compare.png" alt="השוואה" width={44} height={44} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4F483F' }}>השוואת מחירים</span>
          </Link>

          <Link
            href="/shopping-list"
            className="animate-slide-up-3 flex flex-col items-center gap-2 py-5 rounded-3xl"
            style={{
              background: 'rgba(233, 216, 197, 0.75)',
              border: '1.5px solid rgba(182, 171, 156, 0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Image
              src="/icons/cart.png"
              alt="רשימת קניות"
              width={44}
              height={44}
              style={{ objectFit: 'cover', objectPosition: 'top', borderRadius: '50%' }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4F483F' }}>רשימת קניות</span>
          </Link>

          <Link
            href="/history"
            className="animate-slide-up-4 flex flex-col items-center gap-2 py-5 rounded-3xl"
            style={{
              background: 'rgba(233, 216, 197, 0.75)',
              border: '1.5px solid rgba(182, 171, 156, 0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Image src="/icons/history.png" alt="היסטוריה" width={44} height={44} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4F483F' }}>היסטוריה</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
