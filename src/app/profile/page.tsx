'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, LogOut, ShoppingCart, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Image from 'next/image';

const ADMIN_EMAIL = 'noamnisim@gmail.com';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string; id: string; user_metadata?: { avatar_url?: string; full_name?: string; name?: string } } | null>(null);
  const [listCount, setListCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { count } = await supabase
        .from('shopping_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setListCount(count || 0);
      setLoading(false);
    });
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('התנתקת בהצלחה');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
        <div className="flex items-center justify-center py-16">
          <div
            className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full"
            style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Profile card */}
        <div
          className="rounded-3xl p-6 mb-5 text-center"
          style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.5)', backdropFilter: 'blur(8px)' }}
        >
          <div className="flex justify-center mb-3">
            {user?.user_metadata?.avatar_url ? (
              <Image
                src={user.user_metadata.avatar_url}
                alt="תמונת פרופיל"
                width={64}
                height={64}
                className="rounded-full"
                style={{ border: '2px solid rgba(182, 171, 156, 0.5)' }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(191, 44, 44, 0.12)' }}
              >
                <User size={32} style={{ color: '#BF2C2C' }} />
              </div>
            )}
          </div>
          <h1 className="text-lg font-bold mb-1" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
            {user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email}
          </h1>
          {(user?.user_metadata?.full_name || user?.user_metadata?.name) && (
            <p className="text-xs mb-0.5" style={{ color: '#8a7f75' }}>{user?.email}</p>
          )}
          <p className="text-xs" style={{ color: '#8a7f75' }}>חשבון SuperZol</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Link
            href="/shopping-list"
            className="rounded-2xl p-4 text-center transition-opacity hover:opacity-80"
            style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.4)' }}
          >
            <ShoppingCart size={22} className="mx-auto mb-2" style={{ color: '#BF2C2C' }} />
            <div className="text-2xl font-bold" style={{ color: '#4F483F' }}>{listCount}</div>
            <div className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>פריטים ברשימה</div>
          </Link>
          <Link
            href="/search"
            className="rounded-2xl p-4 text-center transition-opacity hover:opacity-80"
            style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.4)' }}
          >
            <Search size={22} className="mx-auto mb-2" style={{ color: '#2d7a2d' }} />
            <div className="text-2xl font-bold" style={{ color: '#4F483F' }}>200K+</div>
            <div className="text-xs mt-0.5" style={{ color: '#8a7f75' }}>מוצרים לחיפוש</div>
          </Link>
        </div>

        {/* Admin panel link — only for admin */}
        {isAdmin && (
          <div
            className="rounded-2xl p-4 mb-5"
            style={{ background: 'rgba(191, 44, 44, 0.07)', border: '1.5px solid rgba(191, 44, 44, 0.25)' }}
          >
            <h2 className="font-bold mb-3 text-sm" style={{ color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}>ניהול</h2>
            <Link
              href="/admin"
              className="flex items-center gap-3 p-3 rounded-xl w-full text-right transition-opacity hover:opacity-80"
              style={{ background: 'rgba(191, 44, 44, 0.1)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}
            >
              <Settings size={16} />
              <span className="font-medium text-sm">פאנל ניהול</span>
            </Link>
          </div>
        )}

        {/* Settings */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(233, 216, 197, 0.85)', border: '1.5px solid rgba(182, 171, 156, 0.4)' }}
        >
          <h2 className="font-bold mb-3 text-sm" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>הגדרות</h2>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 p-3 rounded-xl w-full text-right transition-opacity hover:opacity-70"
            style={{ background: 'rgba(191, 44, 44, 0.08)', color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}
          >
            <LogOut size={16} />
            <span className="font-medium text-sm">התנתק</span>
          </button>
        </div>
      </div>
    </div>
  );
}
