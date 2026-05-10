import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CHAIN_NAMES: Record<string, string> = {
  '7290058140886': 'רמי לוי',
  '7290876100000': 'פרש מרקט',
  '7290803800003': 'יוחננוף',
  '7290103152017': 'אושר עד',
  '7291059100008': 'פוליצר',
  '7290873255550': 'טיב טעם',
  '7290785400000': 'קשת טעמים',
  '7290639000004': 'סטופ מרקט',
  '7290526500006': 'סלח ד',
};

// Server-side Supabase client (uses service role key for reading price_history)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/price-history?item_code=XXX&days=60
 * Returns price history for a product across all chains.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemCode = searchParams.get('item_code');
  const days = parseInt(searchParams.get('days') || '60', 10);

  if (!itemCode) {
    return NextResponse.json({ error: 'Missing item_code' }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

  const { data, error } = await supabase
    .from('price_history')
    .select('chain_id, price, recorded_at')
    .eq('item_code', itemCode)
    .gte('recorded_at', sinceStr)
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('price_history query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Enrich with chain names
  const history = (data || []).map(row => ({
    date: row.recorded_at,
    chain_id: row.chain_id,
    chain_name: CHAIN_NAMES[row.chain_id] || row.chain_id,
    price: row.price,
  }));

  return NextResponse.json(
    { history },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
  );
}
