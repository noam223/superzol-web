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
 * Uses facingMode: environment (default back camera) with continuous autofocus.
 */
export default function BarcodeScanner({ onScan, onClose, title = 'סרוק ברקוד' }: BarcodeScannerProps) {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const [ready, setReady] = useState(false);
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

  // Apply continuous autofocus + zoom reset after stream starts
  const optimizeTrack = useCallback(async () => {
    await new Promise(r => setTimeout(r, 700));
    if (!mountedRef.current) return;
    try {
      const videoEl = document.querySelector(`#${SCANNER_ID} video`) as HTMLVideoElement & { srcObject: MediaStream };
      const track = videoEl?.srcObject?.getVideoTracks?.()?.[0];
      if (!track) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caps = (track as any).getCapabilities?.() as Record<string, unknown> | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const advanced: any[] = [];
      if (caps?.focusMode && Array.isArray(caps.focusMode) && (caps.focusMode as string[]).includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }
      if (caps?.zoom) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced.push({ zoom: (caps.zoom as any).min ?? 1 });
      }
      if (advanced.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (track as any).applyConstraints({ advanced });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mountedRef.current) return;

        const html5QrCode = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = html5QrCode;

        // Use facingMode: environment — browser picks the default back camera (camera 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (html5QrCode as any).start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 260, height: 150 },
            aspectRatio: 1.333,
            disableFlip: false,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          },
          (decodedText: string) => { handleScan(decodedText); },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (_err: string) => { /* normal — no barcode in frame */ }
        );

        if (mountedRef.current) {
          setReady(true);
          optimizeTrack();
        }
      } catch (err) {
        console.error('BarcodeScanner error:', err);
      }
    };

    start();
    return () => {
      mountedRef.current = false;
      if (scannerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scannerRef.current as any).stop().catch(() => {});
      }
    };
  }, [handleScan, optimizeTrack]);

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
          className="flex items-center justify-center rounded-full"
          style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(8px)' }}
        >
          <X size={18} />
        </button>
        <p className="text-white font-bold text-base" style={{ fontFamily: 'Heebo, sans-serif' }}>
          {title}
        </p>
        <div style={{ width: 40 }}>
          {ready ? <Zap size={16} style={{ color: '#4ade80', margin: '0 auto' }} /> : <ZapOff size={16} style={{ color: 'rgba(255,255,255,0.4)', margin: '0 auto' }} />}
        </div>
      </div>

      {/* ── Camera region ── */}
      <div className="flex-1 relative overflow-hidden">
        <div id={SCANNER_ID} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
        <style>{`
          #${SCANNER_ID} > * { border: none !important; }
          #${SCANNER_ID} video {
            width: 100% !important; height: 100% !important;
            object-fit: cover !important; position: absolute !important; inset: 0 !important;
          }
          #${SCANNER_ID} img { display: none !important; }
          #${SCANNER_ID} > div:not(:has(video)) { display: none !important; }
        `}</style>

        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 65% 40% at 50% 50%, transparent 0%, rgba(0,0,0,0.65) 100%)', zIndex: 2 }} />

        {/* Flash */}
        {scanFlash && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(74,222,128,0.18)', zIndex: 3 }} />
        )}

        {/* Scan frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
          <div className="relative" style={{ width: 300, height: 190 }}>
            {([
              { top: 0, left: 0, borderTop: '3px solid white', borderLeft: '3px solid white', borderRadius: '10px 0 0 0' },
              { top: 0, right: 0, borderTop: '3px solid white', borderRight: '3px solid white', borderRadius: '0 10px 0 0' },
              { bottom: 0, left: 0, borderBottom: '3px solid white', borderLeft: '3px solid white', borderRadius: '0 0 0 10px' },
              { bottom: 0, right: 0, borderBottom: '3px solid white', borderRight: '3px solid white', borderRadius: '0 0 10px 0' },
            ] as React.CSSProperties[]).map((style, i) => (
              <div key={i} className="absolute" style={{ ...style, width: 32, height: 32, opacity: scanFlash ? 0.3 : 1 }} />
            ))}
            <div className="absolute left-3 right-3" style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 20%, white 50%, rgba(255,255,255,0.9) 80%, transparent)', boxShadow: '0 0 8px 2px rgba(255,255,255,0.4)', animation: 'scanline 2s ease-in-out infinite', top: '50%' }} />
            {scanFlash && <div className="absolute inset-0 rounded-xl" style={{ border: '2px solid #4ade80', boxShadow: '0 0 20px rgba(74,222,128,0.5)' }} />}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 flex flex-col items-center gap-2 px-6 pb-8 pt-4" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 100%)', position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        {lastScanned ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl" style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
            <Zap size={14} style={{ color: '#4ade80' }} />
            <span className="text-sm font-medium" style={{ color: '#4ade80', fontFamily: 'Heebo, sans-serif' }}>נסרק: {lastScanned}</span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Heebo, sans-serif' }}>כוון את הברקוד לתוך המסגרת</p>
        )}
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
