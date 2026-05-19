'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Zap, ZapOff, Camera } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

const SCANNER_ID = 'html5qrcode-scanner-region';

/**
 * Full-screen barcode scanner.
 *
 * Two modes:
 * 1. Live camera stream (html5-qrcode) — works on Android Chrome with BarcodeDetector
 * 2. Native camera capture (input[type=file capture=environment]) — works on iOS Safari
 *    with full native autofocus/macro support
 */
export default function BarcodeScanner({ onScan, onClose, title = 'סרוק ברקוד' }: BarcodeScannerProps) {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'stream' | 'capture'>('stream');
  const [decoding, setDecoding] = useState(false);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const scannerRef = useRef<unknown>(null);
  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Mode 1: Live stream via html5-qrcode ──────────────────────────────────
  const startStream = useCallback(async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!mountedRef.current) return;

      const html5QrCode = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = html5QrCode;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (html5QrCode as any).start(
        { facingMode: { exact: 'environment' } },
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.777,
          disableFlip: false,
          videoConstraints: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        (decodedText: string) => { handleScan(decodedText); },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_err: string) => { /* normal — no barcode in frame */ }
      );

      if (mountedRef.current) setReady(true);

      // Reset zoom to 1x after stream starts
      setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videoEl = document.querySelector(`#${SCANNER_ID} video`) as any;
          const stream: MediaStream = videoEl?.srcObject;
          const vt = stream?.getVideoTracks?.()?.[0];
          if (vt) {
            try { await (vt as any).applyConstraints({ advanced: [{ zoom: 1 }] }); } catch { /* ignore */ }
            try { await (vt as any).applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }, 800);

    } catch (err) {
      console.error('Stream scanner error:', err);
      if (mountedRef.current) {
        // Auto-switch to capture mode on failure
        setMode('capture');
        setReady(true);
      }
    }
  }, [handleScan]);

  const stopStream = useCallback(async () => {
    if (scannerRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (scannerRef.current as any).stop();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (mode === 'stream') {
      startStream();
    } else {
      setReady(true);
    }
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Mode 2: Native camera capture ─────────────────────────────────────────
  const handleFileCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecoding(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const reader = new Html5Qrcode('__offscreen_decoder__');
      const result = await reader.scanFile(file, false);
      handleScan(result);
    } catch {
      setError('לא זוהה ברקוד בתמונה — נסה שוב');
      setTimeout(() => setError(null), 2500);
    } finally {
      setDecoding(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [handleScan]);

  const switchMode = useCallback(async () => {
    await stopStream();
    setReady(false);
    setMode(prev => prev === 'stream' ? 'capture' : 'stream');
  }, [stopStream]);

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
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <button
            onClick={switchMode}
            className="flex items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-50"
            style={{
              width: 36, height: 36,
              background: mode === 'capture' ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)',
              border: mode === 'capture' ? '1.5px solid rgba(74,222,128,0.6)' : '1.5px solid rgba(255,255,255,0.15)',
              color: mode === 'capture' ? '#4ade80' : 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(8px)',
            }}
            title={mode === 'stream' ? 'עבור למצלמה מלאה (iOS)' : 'עבור לסריקה חיה'}
          >
            <Camera size={16} />
          </button>
          {ready ? (
            <Zap size={16} style={{ color: '#4ade80' }} />
          ) : (
            <ZapOff size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>
      </div>

      {/* ── Camera region ── */}
      <div className="flex-1 relative overflow-hidden">

        {mode === 'stream' ? (
          <>
            {/* html5-qrcode mounts video here */}
            <div
              id={SCANNER_ID}
              style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
            />
            <style>{`
              #${SCANNER_ID} > * { border: none !important; }
              #${SCANNER_ID} video {
                width: 100% !important; height: 100% !important;
                object-fit: cover !important; position: absolute !important; inset: 0 !important;
              }
              #${SCANNER_ID} img { display: none !important; }
              #${SCANNER_ID} > div:not(:has(video)) { display: none !important; }
            `}</style>
          </>
        ) : (
          /* Capture mode: big button to open native camera */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
            <div className="text-center">
              <Camera size={56} style={{ color: 'rgba(255,255,255,0.5)', margin: '0 auto 12px' }} />
              <p className="text-white font-semibold text-lg mb-2" style={{ fontFamily: 'Heebo, sans-serif' }}>
                מצלמה מלאה
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Heebo, sans-serif' }}>
                פותח את מצלמת המכשיר עם פוקוס מלא
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={decoding}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base disabled:opacity-50"
              style={{ background: '#4ade80', color: '#000', fontFamily: 'Heebo, sans-serif' }}
            >
              {decoding ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={20} />
              )}
              {decoding ? 'מפענח...' : 'צלם ברקוד'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileCapture}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Dark vignette (stream mode only) */}
        {mode === 'stream' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 65% 40% at 50% 50%, transparent 0%, rgba(0,0,0,0.65) 100%)',
              zIndex: 2,
            }}
          />
        )}

        {/* Scan flash */}
        {scanFlash && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(74, 222, 128, 0.18)', transition: 'opacity 0.3s', zIndex: 3 }}
          />
        )}

        {/* Scan frame (stream mode only) */}
        {mode === 'stream' && (
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
              {scanFlash && (
                <div className="absolute inset-0 rounded-xl" style={{ border: '2px solid #4ade80', boxShadow: '0 0 20px rgba(74,222,128,0.5)' }} />
              )}
            </div>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="absolute bottom-32 left-4 right-4 flex items-center justify-center" style={{ zIndex: 5 }}>
            <div className="px-4 py-2 rounded-2xl text-sm font-medium" style={{ background: 'rgba(191,44,44,0.9)', color: 'white', fontFamily: 'Heebo, sans-serif' }}>
              {error}
            </div>
          </div>
        )}

        {/* Offscreen div for file decode */}
        <div id="__offscreen_decoder__" style={{ display: 'none' }} />
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
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl" style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
            <Zap size={14} style={{ color: '#4ade80' }} />
            <span className="text-sm font-medium" style={{ color: '#4ade80', fontFamily: 'Heebo, sans-serif' }}>
              נסרק: {lastScanned}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Heebo, sans-serif' }}>
            {mode === 'stream' ? 'כוון את הברקוד לתוך המסגרת' : 'לחץ "צלם ברקוד" לפתיחת המצלמה'}
          </p>
        )}
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Heebo, sans-serif' }}>
          {mode === 'stream' ? 'לא מתמקד? לחץ על 📷 למצלמה מלאה' : 'מצלמה מלאה — פוקוס מלא'}
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
