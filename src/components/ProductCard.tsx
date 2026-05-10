'use client';

import { useState } from 'react';
import { ShoppingCart, Tag } from 'lucide-react';
import { Product } from '@/lib/types';
import { CHAIN_NAMES } from '@/lib/typesense';
import { getProductImageUrl, getProductImageFallback } from '@/lib/images';
import Link from 'next/link';

type Props = {
  product: Product;
  onAddToList?: (product: Product) => void;
};

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
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: 72,
          height: 72,
          background: 'linear-gradient(135deg, #f0e8e0, #e8ddd5)',
          fontSize: 28,
          flexShrink: 0,
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
        width: 72,
        height: 72,
        objectFit: 'contain',
        borderRadius: 12,
        flexShrink: 0,
        background: '#f8f4f0',
      }}
    />
  );
}

export default function ProductCard({ product, onAddToList }: Props) {
  const chainName = CHAIN_NAMES[product.chain_id] || product.chain_id;
  const hasPromo = product.has_promotion && product.promo_price;
  const displayPrice = hasPromo ? product.promo_price! : product.item_price;
  const savings = hasPromo ? product.item_price - product.promo_price! : 0;

  return (
    <div
      className="flex gap-3 p-3 rounded-2xl transition-shadow duration-200 hover:shadow-md"
      style={{
        background: 'rgba(233, 216, 197, 0.85)',
        border: '1.5px solid rgba(182, 171, 156, 0.4)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Product image */}
      <Link href={`/product/${product.item_code}`}>
        <ProductImage itemCode={product.item_code} name={product.item_name} />
      </Link>

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        {/* Top row: chain badge + promo badge */}
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C' }}
          >
            {chainName}
          </span>
          {hasPromo && (
            <span className="flex items-center gap-1 text-xs font-semibold bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
              <Tag size={10} />
              מבצע
            </span>
          )}
        </div>

        {/* Product name */}
        <Link href={`/product/${product.item_code}`}>
          <h3
            className="font-semibold text-sm leading-snug line-clamp-2"
            style={{ color: '#4F483F' }}
          >
            {product.item_name}
          </h3>
        </Link>

        {/* Manufacturer */}
        {product.manufacturer_name && (
          <p className="text-xs" style={{ color: '#8a7f75' }}>
            {product.manufacturer_name}
          </p>
        )}

        {/* Price row */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: '#2d7a2d' }}>
              ₪{displayPrice.toFixed(2)}
            </span>
            {hasPromo && (
              <span className="text-xs line-through" style={{ color: '#aaa' }}>
                ₪{product.item_price.toFixed(2)}
              </span>
            )}
          </div>

          {onAddToList && (
            <button
              onClick={() => onAddToList(product)}
              className="p-1.5 rounded-xl transition-colors"
              style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C' }}
              title="הוסף לרשימת קניות"
            >
              <ShoppingCart size={16} />
            </button>
          )}
        </div>

        {/* Savings */}
        {hasPromo && savings > 0 && (
          <span className="text-xs text-green-600 font-medium">
            חיסכון: ₪{savings.toFixed(2)}
          </span>
        )}

        {/* Unit */}
        {product.unit_of_measure && (
          <p className="text-xs" style={{ color: '#aaa' }}>
            {product.unit_qty} {product.unit_of_measure}
          </p>
        )}

        {/* Promo description */}
        {hasPromo && product.promo_description && (
          <div
            className="text-xs rounded-lg px-2 py-1 border mt-1"
            style={{
              color: '#2d7a2d',
              background: 'rgba(45, 122, 45, 0.07)',
              borderColor: 'rgba(45, 122, 45, 0.2)',
            }}
          >
            {product.promo_description}
          </div>
        )}
      </div>
    </div>
  );
}
