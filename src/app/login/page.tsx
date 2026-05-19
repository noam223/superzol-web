'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import GoogleAuthButton from '@/components/GoogleAuthButton';

// Inner component that uses useSearchParams — must be inside <Suspense>
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (searchParams.get('linked') === '1') {
      toast.success('החשבון שלך קושר ל-Google! התחבר שוב עם Google.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('נשלח אימייל אימות — בדוק את תיבת הדואר שלך');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('התחברת בהצלחה!');
        router.push(nextPath);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה בהתחברות';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(233, 216, 197, 0.7)',
    border: '1.5px solid rgba(182, 171, 156, 0.5)',
    color: '#4F483F',
    fontFamily: 'Heebo, sans-serif',
    borderRadius: 16,
    padding: '12px 44px 12px 16px',
    width: '100%',
    fontSize: 15,
    outline: 'none',
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <Image src="/icons/logo.png" alt="SuperZol" width={216} height={216} style={{ borderRadius: 48 }} />
        </div>
        <h1 className="text-3xl font-black" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
          SuperZol
        </h1>
        <p className="text-sm mt-1" style={{ color: '#8a7f75' }}>השוואת מחירים בסופרמרקטים</p>
      </div>

      {/* Card */}
      <div
        className="rounded-3xl p-6"
        style={{
          background: 'rgba(233, 216, 197, 0.9)',
          border: '1.5px solid rgba(182, 171, 156, 0.5)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h2 className="text-lg font-bold mb-5" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
          {isSignUp ? 'יצירת חשבון' : 'התחברות'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2" size={18} style={{ color: '#8a7f75' }} />
            <input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
              dir="ltr"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2" size={18} style={{ color: '#8a7f75' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 44 }}
              required
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: '#8a7f75' }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
          >
            {loading ? 'טוען...' : isSignUp ? 'צור חשבון' : 'התחבר'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div style={{ flex: 1, height: 1, background: 'rgba(182, 171, 156, 0.5)' }} />
          <span style={{ fontSize: 13, color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>או</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(182, 171, 156, 0.5)' }} />
        </div>

        {/* Google Sign-In */}
        <GoogleAuthButton redirectTo={nextPath} />

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm hover:opacity-70 transition-opacity"
            style={{ color: '#BF2C2C', fontFamily: 'Heebo, sans-serif' }}
          >
            {isSignUp ? 'כבר יש לך חשבון? התחבר' : 'אין לך חשבון? הירשם'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'url(/icons/background.jpg) center/cover fixed', backgroundColor: '#DAD1CA' }}
    >
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full"
            style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
