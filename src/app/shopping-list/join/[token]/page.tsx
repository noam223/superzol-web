'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, Check, X } from 'lucide-react';
import Link from 'next/link';

export default function JoinSharedListPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === 'string' ? params.token : '';

  const [status, setStatus] = useState<'loading' | 'joining' | 'success' | 'already' | 'error'>('loading');
  const [listName, setListName] = useState('');
  const [listId, setListId] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }

    const join = async () => {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Redirect to login, then come back
        router.push(`/login?next=/shopping-list/join/${token}`);
        return;
      }

      // 2. Look up the list by share_token
      const { data: list, error: listError } = await supabase
        .from('shopping_lists')
        .select('id, name, owner_id')
        .eq('share_token', token)
        .single();

      if (listError || !list) {
        setStatus('error');
        return;
      }

      setListName(list.name);
      setListId(list.id);

      // 3. If user is the owner, just redirect to the list
      if (list.owner_id === user.id) {
        setStatus('already');
        return;
      }

      setStatus('joining');

      // 4. Check if already a member
      const { data: existing } = await supabase
        .from('shared_list_members')
        .select('list_id')
        .eq('list_id', list.id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        setStatus('already');
        return;
      }

      // 5. Insert membership
      const { error: memberError } = await supabase
        .from('shared_list_members')
        .insert({ list_id: list.id, user_id: user.id });

      if (memberError) {
        setStatus('error');
        return;
      }

      setStatus('success');
    };

    join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const goToList = () => {
    if (listId) router.push(`/shopping-list/named-${listId}`);
    else router.push('/shopping-list');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="w-full max-w-sm rounded-3xl p-8 text-center"
        style={{ background: 'rgba(237,228,218,0.95)', boxShadow: '0 8px 40px rgba(79,72,63,0.18)' }}
        dir="rtl">

        {status === 'loading' || status === 'joining' ? (
          <>
            <div className="flex justify-center mb-5">
              <div className="animate-spin w-12 h-12 border-3 border-t-transparent rounded-full"
                style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent', borderWidth: 3 }} />
            </div>
            <p className="text-base font-semibold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
              {status === 'joining' ? 'מצטרף לרשימה...' : 'טוען...'}
            </p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(45,122,45,0.15)' }}>
                <Check size={32} style={{ color: '#2d7a2d' }} />
              </div>
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
              הצטרפת לרשימה!
            </h1>
            <p className="text-sm mb-6" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>
              {listName && `"${listName}" `}נוספה לרשימות שלך
            </p>
            <button
              onClick={goToList}
              className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
            >
              <ShoppingCart size={16} />
              פתח את הרשימה
            </button>
          </>
        ) : status === 'already' ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(191,44,44,0.1)' }}>
                <ShoppingCart size={32} style={{ color: '#BF2C2C' }} />
              </div>
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
              הרשימה כבר שלך
            </h1>
            <p className="text-sm mb-6" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>
              {listName && `"${listName}" `}כבר נמצאת ברשימות שלך
            </p>
            <button
              onClick={goToList}
              className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
            >
              <ShoppingCart size={16} />
              פתח את הרשימה
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(191,44,44,0.1)' }}>
                <X size={32} style={{ color: '#BF2C2C' }} />
              </div>
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: '#3a342c', fontFamily: 'Heebo, sans-serif' }}>
              הקישור לא תקין
            </h1>
            <p className="text-sm mb-6" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>
              הרשימה לא נמצאה או שהקישור פג תוקף
            </p>
            <Link
              href="/shopping-list"
              className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif', display: 'flex' }}
            >
              חזור לרשימות
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
