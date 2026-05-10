export type Product = {
  id: string;
  item_code: string;
  item_name: string;
  manufacturer_name?: string;
  manufacturer_item_id?: string;
  item_price: number;
  unit_qty?: string;
  quantity?: number;
  unit_of_measure?: string;
  is_weighted?: boolean;
  qty_in_package?: number;
  chain_id: string;
  store_id: string;
  // promo fields
  promo_price?: number;
  promo_description?: string;
  promo_end_date?: string;
  has_promotion?: boolean;
};

export type Store = {
  id: string;
  store_id: string;
  chain_id: string;
  chain_name: string;
  store_name: string;
  address: string;
  city: string;
  location: [number, number]; // [lat, lng]
};

export type SearchResult = {
  chainId: string;
  chainName: string;
  product: Product;
  store?: Store;
};

export type PriceComparison = {
  itemCode: string;
  itemName: string;
  prices: {
    chainId: string;
    chainName: string;
    storeId: string;
    storeName: string;
    price: number;
    promoPrice?: number;
    promoDescription?: string;
  }[];
};
