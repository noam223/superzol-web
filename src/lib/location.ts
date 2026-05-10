import { supabase } from '@/lib/supabase';

export type UserLocation = {
  lat: number;
  lng: number;
  label: string;
};

// ── Get saved location from Supabase (logged-in users) or localStorage (guests) ──
export async function getUserLocation(): Promise<UserLocation | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Logged-in: read from Supabase
      const { data, error } = await supabase
        .from('user_location')
        .select('lat, lng, label')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        return { lat: data.lat, lng: data.lng, label: data.label || 'מיקום שמור' };
      }
    }

    // Guest or no Supabase record: fall back to localStorage
    const raw = localStorage.getItem('superzol_location');
    if (raw) {
      const parsed = JSON.parse(raw) as UserLocation;
      if (parsed.lat && parsed.lng) return parsed;
    }
  } catch { /* skip */ }
  return null;
}

// ── Save location to Supabase (logged-in) or localStorage (guest) ──
export async function saveUserLocation(lat: number, lng: number, label: string): Promise<void> {
  const loc: UserLocation = { lat, lng, label };

  // Always save to localStorage as fallback
  try {
    localStorage.setItem('superzol_location', JSON.stringify(loc));
  } catch { /* skip */ }

  // If logged in, also save to Supabase (upsert)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_location').upsert({
        user_id: user.id,
        lat,
        lng,
        label,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
  } catch { /* skip */ }
}

// ── Clear saved location ──
export async function clearUserLocation(): Promise<void> {
  try {
    localStorage.removeItem('superzol_location');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_location').delete().eq('user_id', user.id);
    }
  } catch { /* skip */ }
}

// ── Search city using OpenStreetMap Nominatim (free, no API key) ──
export async function searchCity(query: string): Promise<UserLocation[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '5',
      countrycodes: 'il',
      'accept-language': 'he',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'SuperZol/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data as Array<{ lat: string; lon: string; display_name: string }>).map(r => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      label: r.display_name.split(',')[0], // First part of address
    }));
  } catch {
    return [];
  }
}

// ── Get GPS location via browser ──
export function getGpsLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: 'מיקום נוכחי (GPS)',
      }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}
