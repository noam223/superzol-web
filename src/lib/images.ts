/**
 * Returns the best available image URL for a product.
 * Primary: local /product-images/{itemCode}.jpg (served from public folder)
 * Fallback: pricez.co.il CDN
 */
export function getProductImageUrl(itemCode: string): string {
  return `/product-images/${itemCode}.jpg`;
}

export function getProductImageFallback(itemCode: string): string {
  return `https://m.pricez.co.il/ProductPictures/200x/${itemCode}.jpg`;
}
