import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured =
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey !== 'placeholder-key';

export type ShoppingListItem = {
  id: string;
  user_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  checked: boolean;
  created_at: string;
};

export type ShoppingList = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  items: ShoppingListItem[];
};
