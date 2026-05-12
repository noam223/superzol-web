/**
 * Maps chain_name (Hebrew) to logo filename in /chain-logos/
 */
const CHAIN_LOGO_MAP: Record<string, string> = {
  'רמי לוי':     '/chain-logos/ramilevi.jpg',
  'יוחננוף':     '/chain-logos/yohananof.png',
  'אושר עד':     '/chain-logos/osherad.jpg',
  'טיב טעם':     '/chain-logos/tivtaam.jpg',
  'סטופ מרקט':   '/chain-logos/stopmarket.jpg',
  'סלאח דבאח':   '/chain-logos/dabah.png',
  'פוליצר':      '/chain-logos/politzer.png',
  'קשת':         '/chain-logos/keshet.jpg',
  'פרש מרקט':    '/chain-logos/FreshMarket.png',
};

export function getChainLogoUrl(chainName: string): string | null {
  return CHAIN_LOGO_MAP[chainName] ?? null;
}
