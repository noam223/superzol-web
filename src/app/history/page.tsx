'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Trash2, Clock } from 'lucide-react';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import { RecentProduct, getHistory, clearHistory as clearHistoryLib } from '@/lib/history';

function ProductImage({ itemCode, name }: { itemCode: string; name: string }) {
  const [src, setSrc] = useState(getProductImageUrl(itemCode));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => {
        if (src === getProductImageUrl(itemCode)) setSrc(getProductImageFallback(itemCode));
      }}
      style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: 'white', flexShrink: 0 }}
    />
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  const days = Math.floor(hrs / 24);
  return `לפני ${days} ימים`;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<RecentProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
    setLoaded(true);
  }, []);

  const handleClear = () => {
    clearHistoryLib();
    setHistory([]);
  };

  return (
    <div
      className="min-h-screen pb-28"
      style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}
    >
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Image src="/icons/history.png" alt="היסטוריה" width={32} height={32} />
            <h1 className="text-xl font-bold" style={{ color: '#4F483F', fontFamily: 'Rubik, Heebo, sans-serif' }}>
              היסטוריית צפייה
            </h1>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(191,44,44,0.1)', color: '#BF2C2C' }}
            >
              <Trash2 size={13} />
              נקה הכל
            </button>
          )}
        </div>

        {!loaded ? (
          <div className="text-center py-16" style={{ color: '#8a7f75' }}>
            <div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto mb-3" style={{ borderColor: '#B6AB9C', borderTopColor: 'transparent' }} />
          </div>
        ) : history.length === 0 ? (
          <div
            className="flex flex-col items-center gap-4 p-10 rounded-3xl text-center"
            style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)' }}
          >
            <Clock size={48} style={{ color: '#B6AB9C' }} />
            <p className="font-semibold" style={{ color: '#4F483F' }}>אין היסטוריית צפייה</p>
            <p className="text-sm" style={{ color: '#8a7f75' }}>מוצרים שתצפה בהם יופיעו כאן</p>
            <Link
              href="/search"
              className="text-sm px-5 py-2 rounded-xl font-medium"
              style={{ background: '#BF2C2C', color: 'white' }}
            >
              חפש מוצרים
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((item) => (
              <Link
                key={item.item_code}
                href={`/product/${item.item_code}`}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.4)' }}
              >
                <ProductImage itemCode={item.item_code} name={item.item_name} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: '#4F483F' }}>{item.item_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#B6AB9C' }}>{timeAgo(item.viewed_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-base font-bold" style={{ color: '#2d7a2d' }}>
                    ₪{item.min_price.toFixed(2)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
