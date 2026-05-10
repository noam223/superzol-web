'use client';

import { useEffect, useState, useRef } from 'react';
import { MapPin, Navigation, Search, X, ChevronDown } from 'lucide-react';
import { getUserLocation, saveUserLocation, searchCity, getGpsLocation, UserLocation } from '@/lib/location';

export default function LocationPrompt() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'choose' | 'city' | 'loading'>('choose');
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<UserLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check on mount: show only if no location saved yet
  useEffect(() => {
    getUserLocation().then(loc => {
      if (!loc) setShow(true);
    });
  }, []);

  // City search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!cityQuery.trim()) { setCityResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchCity(cityQuery);
      setCityResults(results);
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cityQuery]);

  const handleGps = async () => {
    setGpsLoading(true);
    setError('');
    try {
      const loc = await getGpsLocation();
      await saveUserLocation(loc.lat, loc.lng, loc.label);
      setShow(false);
    } catch {
      setError('לא ניתן לקבל מיקום GPS. נסה לבחור עיר.');
      setGpsLoading(false);
    }
  };

  const handleCitySelect = async (loc: UserLocation) => {
    await saveUserLocation(loc.lat, loc.lng, loc.label);
    setShow(false);
  };

  const handleDismiss = () => {
    // Save a sentinel so we don't ask again this session
    try { sessionStorage.setItem('superzol_loc_dismissed', '1'); } catch { /* skip */ }
    setShow(false);
  };

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100]"
        style={{ background: 'rgba(79, 72, 63, 0.5)', backdropFilter: 'blur(4px)' }}
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-3xl p-6 pb-10"
        style={{
          background: 'rgba(233, 216, 197, 0.98)',
          boxShadow: '0 -8px 40px rgba(79, 72, 63, 0.2)',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(182, 171, 156, 0.6)' }} />

        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-5 left-5 p-1.5 rounded-full"
          style={{ background: 'rgba(182, 171, 156, 0.3)', color: '#8a7f75' }}
        >
          <X size={16} />
        </button>

        {step === 'choose' && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(191, 44, 44, 0.1)' }}
              >
                <MapPin size={24} style={{ color: '#BF2C2C' }} />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                  איפה אתה קונה?
                </h2>
                <p className="text-sm" style={{ color: '#8a7f75', fontFamily: 'Heebo, sans-serif' }}>
                  נמצא את הסופרמרקטים הקרובים אליך
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm mb-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(191,44,44,0.08)', color: '#BF2C2C' }}>
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 mt-5">
              {/* GPS button */}
              <button
                onClick={handleGps}
                disabled={gpsLoading}
                className="flex items-center gap-3 p-4 rounded-2xl font-bold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#BF2C2C', color: 'white', fontFamily: 'Heebo, sans-serif' }}
              >
                <Navigation size={18} />
                {gpsLoading ? 'מאתר מיקום...' : 'השתמש במיקום הנוכחי שלי (GPS)'}
              </button>

              {/* City search button */}
              <button
                onClick={() => setStep('city')}
                className="flex items-center gap-3 p-4 rounded-2xl font-bold text-sm transition-opacity hover:opacity-80"
                style={{
                  background: 'rgba(233, 216, 197, 0.8)',
                  border: '1.5px solid rgba(182, 171, 156, 0.5)',
                  color: '#4F483F',
                  fontFamily: 'Heebo, sans-serif',
                }}
              >
                <Search size={18} style={{ color: '#8a7f75' }} />
                בחר עיר / שכונה
                <ChevronDown size={16} className="mr-auto" style={{ color: '#8a7f75' }} />
              </button>

              {/* Skip */}
              <button
                onClick={handleDismiss}
                className="text-sm py-2 text-center"
                style={{ color: '#B6AB9C', fontFamily: 'Heebo, sans-serif' }}
              >
                אחר כך
              </button>
            </div>
          </>
        )}

        {step === 'city' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { setStep('choose'); setCityQuery(''); setCityResults([]); }}
                className="p-1.5 rounded-full"
                style={{ background: 'rgba(182, 171, 156, 0.3)', color: '#8a7f75' }}
              >
                <X size={16} />
              </button>
              <h2 className="text-lg font-bold" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                חפש עיר או שכונה
              </h2>
            </div>

            {/* City search input */}
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: '#8a7f75' }} />
              <input
                type="text"
                placeholder="למשל: תל אביב, ירושלים, חיפה..."
                value={cityQuery}
                onChange={e => setCityQuery(e.target.value)}
                autoFocus
                className="w-full pr-9 pl-4 py-3 rounded-2xl text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  border: '1.5px solid rgba(182, 171, 156, 0.5)',
                  color: '#4F483F',
                  fontFamily: 'Heebo, sans-serif',
                }}
              />
            </div>

            {/* Results */}
            {searching && (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full" style={{ borderColor: '#BF2C2C', borderTopColor: 'transparent' }} />
              </div>
            )}

            {!searching && cityResults.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(182,171,156,0.4)' }}>
                {cityResults.map((loc, i) => (
                  <button
                    key={i}
                    onClick={() => handleCitySelect(loc)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 text-right transition-colors hover:bg-black/5"
                    style={{ borderColor: 'rgba(182,171,156,0.2)', background: 'rgba(255,255,255,0.7)' }}
                  >
                    <MapPin size={16} style={{ color: '#BF2C2C', flexShrink: 0 }} />
                    <span className="text-sm font-medium" style={{ color: '#4F483F', fontFamily: 'Heebo, sans-serif' }}>
                      {loc.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!searching && cityQuery && cityResults.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: '#8a7f75' }}>
                לא נמצאו תוצאות עבור &quot;{cityQuery}&quot;
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
