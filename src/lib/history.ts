export type RecentProduct = {
  item_code: string;
  item_name: string;
  min_price: number;
  viewed_at: number; // timestamp ms
};

export const HISTORY_KEY = 'superzol_history';
export const MAX_HISTORY = 30;

export function addToHistory(product: Omit<RecentProduct, 'viewed_at'>) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history: RecentProduct[] = raw ? JSON.parse(raw) : [];
    // Remove existing entry for same item_code
    const filtered = history.filter(h => h.item_code !== product.item_code);
    // Add to front with current timestamp
    filtered.unshift({ ...product, viewed_at: Date.now() });
    // Keep only last MAX_HISTORY
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
  } catch { /* skip */ }
}

export function getHistory(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch { /* skip */ }
}
