'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Zap, ZapOff, Focus } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Full-screen camera barcode scanner — polished UI.
 *
 * Strategy (in order of preference):
 * 1. BarcodeDetector Web API (Google ML Kit on Android Chrome) — best autofocus, fastest
 * 2. @zxing/browser fallback for iOS / older browsers
 *
 * Stays open after each scan. Tap to focus.
 * Macro toggle button for close-up scanning.
 */
export default function BarcodeScanner({ onScan, onClose, title = 'סרוק ברקוד' }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zxingControlsRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const [tapFeedback, setTapFeedback] = useState<{ x: number; y: number } | null>(null);
  const [usingGoogle, setUsingGoogle] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const [ready, setReady] = useState(false);
  const [macroMode, setMacroMode] = useState(true); // default: macro/close-up mode

  // ── BarcodeDetector (Google ML Kit) loop ──────────────────────────────────
  const startBarcodeDetector = useCallback(async (stream: MediaStream) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    const detector = new BD({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'],
    });

    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();
    setUsingGoogle(true);
    setReady(true);

    const scan = async () => {
      if (!mountedRef.current) return;
      if (video.readyState >= 2) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const barcodes: any[] = await detector.detect(video);
          if (barcodes.length > 0) {
            const code: string = barcodes[0].rawValue;
            const now = Date.now();
            if (!(code === lastCodeRef.current && now - lastTimeRef.current < 2000)) {
              lastCodeRef.current = code;
              lastTimeRef.current = now;
              setLastScanned(code);
              setScanFlash(true);
              setTimeout(() => setScanFlash(false), 600);
              onScan(code);
            }
          }
        } catch { /* frame not ready */ }
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
  }, [onScan]);

  // ── ZXing fallback ────────────────────────────────────────────────────────
  const startZxing = useCallback(async (stream: MediaStream) => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);
    if (!videoRef.current || !mountedRef.current) return;
    setReady(true);

    const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
      if (!result || !mountedRef.current) return;
      const code = result.getText();
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastTimeRef.current < 2000) return;
      lastCodeRef.current = code;
      lastTimeRef.current = now;
      setLastScanned(code);
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 600);
      onScan(code);
    });
    zxingControlsRef.current = controls;
  }, [onScan]);

  // ── Apply focus constraints to the active video track ────────────────────
  const applyFocusConstraints = useCallback(async (macro: boolean) => {
    const [vt] = streamRef.current?.getVideoTracks() ?? [];
    if (!vt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caps = (vt as any).getCapabilities?.() as Record<string, unknown> | undefined;
    const supportsFocusMode = caps && Array.isArray(caps.focusMode);
    if (!supportsFocusMode) return;

    try {
      if (macro) {
        // Try macro / close-up: set focusMode to manual with a short focusDistance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (vt as any).applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: 0 } as any] });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (vt as any).applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
      }
    } catch {
      // Some browsers don't support focusDistance — just try continuous
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (vt as any).applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
      } catch { /* ignore */ }
    }
  }, []);

  // ── Toggle macro mode ─────────────────────────────────────────────────────
  const toggleMacro = useCallback(async () => {
    const next = !macroMode;
    setMacroMode(next);
    await applyFocusConstraints(next);
  }, [macroMode, applyFocusConstraints]);

  // ── Main start ────────────────────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    try {
      // Request camera — try with continuous autofocus first
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(({ focusMode: 'continuous' } as any)),
          },
        });
      } catch {
        // Fallback without focusMode if browser rejects it
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      }
      streamRef.current = stream;

      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

      // After stream is ready, apply macro (close-up) focus by default
      // (some browsers ignore constraints in getUserMedia but honour applyConstraints)
      const [vt] = stream.getVideoTracks();
      if (vt) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (vt as any).applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: 0 } as any] });
        } catch {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (vt as any).applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
          } catch { /* ignore */ }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasBD = typeof (window as any).BarcodeDetector !== 'undefined';
      if (hasBD) {
        await startBarcodeDetector(stream);
      } else {
        await startZxing(stream);
      }
    } catch (err) {
      console.error('BarcodeScanner error:', err);
    }
  }, [startBarcodeDetector, startZxing]);

  // ── Tap to focus ──────────────────────────────────────────────────────────
  const handleTap = useCallback(async (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) {
      cx = e.touches[0]?.clientX ?? rect.left + rect.width / 2;
      cy = e.touches[0]?.clientY ?? rect.top + rect.height / 2;
    } else {
      cx = e.clientX; cy = e.clientY;
    }
    const x = (cx - rect.left) / rect.width;
    const y = (cy - rect.top) / rect.height;

    setTapFeedback({ x: cx - rect.left, y: cy - rect.top });
    setTimeout(() => setTapFeedback(null), 800);

    const [vt] = streamRef.current?.getVideoTracks() ?? [];
    if (!vt) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (vt as any).applyConstraints({ advanced: [{ pointOfInterest: { x, y }, focusMode: 'single-shot' } as any] });
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (vt as any).applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] });
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startScanner();
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { zxingControlsRef.current?.stop(); } catch { /* ignore */ }
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    };
  }, [startScanner]);

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
        {/* Status indicator + macro toggle */}
        <div className="flex items-center gap-2">
          {/* Macro / close-up toggle */}
          <button
            onClick={e => { e.stopPropagation(); toggleMacro(); }}
            className="flex items-center justify-center rounded-full transition-opacity hover:opacity-80 active:opacity-50"
            style={{
              width: 36, height: 36,
              background: macroMode ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)',
              border: macroMode ? '1.5px solid rgba(74,222,128,0.6)' : '1.5px solid rgba(255,255,255,0.15)',
              color: macroMode ? '#4ade80' : 'rgba(255,255,255,0.6)',
              backdropFilter: 'blur(8px)',
            }}
            title={macroMode ? 'בטל מצב מאקרו' : 'מצב מאקרו (קרוב)'}
          >
            <Focus size={16} />
          </button>
          {ready ? (
            <Zap size={16} style={{ color: '#4ade80' }} />
          ) : (
            <ZapOff size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>
      </div>

      {/* ── Camera — tap to focus ── */}
      <div
        className="flex-1 relative overflow-hidden"
        onClick={handleTap}
        onTouchStart={handleTap}
        style={{ cursor: 'crosshair' }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline muted autoPlay
        />

        {/* Dark vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 65% 40% at 50% 50%, transparent 0%, rgba(0,0,0,0.65) 100%)',
          }}
        />

        {/* Scan flash on success */}
        {scanFlash && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'rgba(74, 222, 128, 0.18)', transition: 'opacity 0.3s' }}
          />
        )}

        {/* ── Scan frame ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: 300, height: 190 }}>

            {/* Corner brackets */}
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
                style={{
                  border: '2px solid #4ade80',
                  boxShadow: '0 0 20px rgba(74,222,128,0.5)',
                  transition: 'all 0.3s',
                }}
              />
            )}
          </div>
        </div>

        {/* Tap feedback circle */}
        {tapFeedback && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: tapFeedback.x - 28, top: tapFeedback.y - 28,
              width: 56, height: 56, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.8)',
              animation: 'tapfade 0.7s ease-out forwards',
            }}
          />
        )}
      </div>

      {/* ── Footer ── */}
      <div
        className="shrink-0 flex flex-col items-center gap-2 px-6 pb-8 pt-4"
        style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 100%)',
          position: 'absolute', bottom: 0, left: 0, right: 0,
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
          {usingGoogle ? 'נסרק על ידי Google · ' : ''}{macroMode ? '🔍 מצב מאקרו פעיל · ' : ''}הקש לפוקוס
        </p>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 8%;  opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 92%; opacity: 0; }
        }
        @keyframes tapfade {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.6); }
        }
      `}</style>
    </div>
  );
}
