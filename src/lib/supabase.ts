import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Singleton: createBrowserClient stores the session in cookies AND localStorage,
// and syncs between them. Must be a singleton so all pages share the same instance.
let _supabase: ReturnType<typeof createBrowserClient> | null = null;

function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

export const supabase = getSupabaseClient();

export const isSupabaseConfigured =
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey !== 'placeholder-key';

export type ShoppingListItem = {
  id: string;
  user_id: string;
  list_id: string | null;
  item_code: string;
  item_name: string;
  quantity: number;
  checked: boolean;
  group_id?: string | null;
  created_at: string;
};

export type ShoppingList = {
  id: string;
  owner_id: string;
  name: string;
  share_token: string;
  created_at: string;
};
