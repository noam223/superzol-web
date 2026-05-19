'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Zap, ZapOff } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

const SCANNER_ID = 'html5qrcode-scanner-region';

/**
 * Full-screen barcode scanner using html5-qrcode.
 * Works on iOS Safari and Android Chrome with proper autofocus.
 */
export default function BarcodeScanner({ onScan, onClose, title = 'סרוק ברקוד' }: BarcodeScannerProps) {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const scannerRef = useRef<unknown>(null);
  const mountedRef = useRef(true);

  const handleScan = useCallback((code: string) => {
    if (!mountedRef.current) return;
    const now = Date.now();
    if (code === lastCodeRef.current && now - lastTimeRef.current < 2000) return;
    lastCodeRef.current = code;
    lastTimeRef.current = now;
    setLastScanned(code);
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 600);
    onScan(code);
  }, [onScan]);

  useEffect(() => {
    mountedRef.current = true;
    let html5QrCode: unknown = null;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mountedRef.current) return;

        html5QrCode = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = html5QrCode;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (html5QrCode as any).start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.777,
            // Disable the built-in UI — we render our own
            disableFlip: false,
          },
          (decodedText: string) => {
            handleScan(decodedText);
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (_errorMessage: string) => {
            // scan errors are normal (no barcode in frame) — ignore
          }
        );

        if (mountedRef.current) setReady(true);
      } catch (err) {
        console.error('BarcodeScanner error:', err);
        if (mountedRef.current) setError('לא ניתן לפתוח את המצלמה');
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      if (html5QrCode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (html5QrCode as any).stop().catch(() => {});
      }
    };
  }, [handleScan]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          height: 60,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        }}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full transition-opacity hover:opacity-70 active:opacity-50"
          style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)' }}
        >
          <X size={18} />
        </button>
        <p className="text-white font-bold text-base" style={{ fontFamily: 'Heebo, sans-serif', letterSpacing: 0.3 }}>
          {title}
        </p>
        <div className="flex items-center gap-1.5">
          {ready ? (
            <Zap size={16} style={{ color: '#4ade80' }} />
          ) : (
            <ZapOff size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>
      </div>

      {/* ── Camera region (html5-qrcode mounts here) ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* html5-qrcode renders the video into this div */}
        <div
          id={SCANNER_ID}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        />

        {/* Hide html5-qrcode's own UI chrome via CSS */}
        <style>{`
          #${SCANNER_ID} > * { border: none !important; }
          #${SCANNER_ID} video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            position: absolute !important;
            inset: 0 !important;
          }
          #${SCANNER_ID} img { display: none !important; }
          #${SCANNER_ID} > div:not(:has(video)) { display: none !important; }
        `}</style>

        {/* Dark vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 65% 40% at 50% 50%, transparent 0%, rgba(0,0,0,0.65) 100%)',
            zIndex: 2,
          }}
        />

        {/* Scan flash on success */}
        {scanFlash && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(74, 222, 128, 0.18)', transition: 'opacity 0.3s', zIndex: 3 }}
          />
        )}

        {/* ── Scan frame ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
          <div className="relative" style={{ width: 300, height: 190 }}>
            {([
              { top: 0, left: 0, borderTop: '3px solid white', borderLeft: '3px solid white', borderRadius: '10px 0 0 0' },
              { top: 0, right: 0, borderTop: '3px solid white', borderRight: '3px solid white', borderRadius: '0 10px 0 0' },
              { bottom: 0, left: 0, borderBottom: '3px solid white', borderLeft: '3px solid white', borderRadius: '0 0 0 10px' },
              { bottom: 0, right: 0, borderBottom: '3px solid white', borderRight: '3px solid white', borderRadius: '0 0 10px 0' },
            ] as React.CSSProperties[]).map((style, i) => (
              <div key={i} className="absolute" style={{ ...style, width: 32, height: 32, opacity: scanFlash ? 0.3 : 1, transition: 'opacity 0.3s' }} />
            ))}

            {/* Animated scan line */}
            <div
              className="absolute left-3 right-3"
              style={{
                height: 2,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 20%, white 50%, rgba(255,255,255,0.9) 80%, transparent 100%)',
                boxShadow: '0 0 8px 2px rgba(255,255,255,0.4)',
                animation: 'scanline 2s ease-in-out infinite',
                top: '50%',
              }}
            />

            {/* Success overlay on frame */}
            {scanFlash && (
              <div
                className="absolute inset-0 rounded-xl"
                style={{ border: '2px solid #4ade80', boxShadow: '0 0 20px rgba(74,222,128,0.5)', transition: 'all 0.3s' }}
              />
            )}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
            <div className="text-center px-6">
              <p className="text-white font-medium mb-3" style={{ fontFamily: 'Heebo, sans-serif' }}>{error}</p>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>סגור</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="shrink-0 flex flex-col items-center gap-2 px-6 pb-8 pt-4"
        style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 100%)',
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        }}
      >
        {lastScanned ? (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-2xl"
            style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}
          >
            <Zap size={14} style={{ color: '#4ade80' }} />
            <span className="text-sm font-medium" style={{ color: '#4ade80', fontFamily: 'Heebo, sans-serif' }}>
              נסרק: {lastScanned}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Heebo, sans-serif' }}>
            כוון את הברקוד לתוך המסגרת
          </p>
        )}
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Heebo, sans-serif' }}>
          הקש לפוקוס
        </p>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 8%;  opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 92%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
