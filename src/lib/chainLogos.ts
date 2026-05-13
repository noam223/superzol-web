/**
 * Maps chain_name (Hebrew) to logo filename in /chain-logos/
 * Keys are substrings that may appear in the full chain_name stored in Typesense.
 */
const CHAIN_LOGO_MAP: Array<{ key: string; url: string }> = [
  { key: 'רמי לוי',    url: '/chain-logos/ramilevi.jpg' },
  { key: 'יוחננוף',    url: '/chain-logos/yohananof.png' },
  { key: 'אושר עד',    url: '/chain-logos/osherad.jpg' },
  { key: 'טיב טעם',    url: '/chain-logos/tivtaam.jpg' },
  { key: 'סטופ מרקט',  url: '/chain-logos/stopmarket.jpg' },
  { key: 'סלאח דבאח',  url: '/chain-logos/dabah.png' },
  { key: 'פוליצר',     url: '/chain-logos/politzer.png' },
  { key: 'קשת',        url: '/chain-logos/keshet.jpg' },
  { key: 'פרש מרקט',   url: '/chain-logos/FreshMarket.png' },
];

export function getChainLogoUrl(chainName: string): string | null {
  if (!chainName) return null;
  const normalized = chainName.trim();
  // Exact match first
  const exact = CHAIN_LOGO_MAP.find(e => e.key === normalized);
  if (exact) return exact.url;
  // Partial match (chain_name in Typesense may be a longer string)
  const partial = CHAIN_LOGO_MAP.find(e => normalized.includes(e.key) || e.key.includes(normalized));
  return partial?.url ?? null;
}
