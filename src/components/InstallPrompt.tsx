'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

const DISMISSED_KEY = 'pwa_install_dismissed'

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Only show on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (!isMobile) return

    // Don't show if already running as installed PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) return

    // Don't show if user already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    setIsIOS(ios)

    if (!ios) {
      // Android: listen for beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setShow(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    } else {
      // iOS: always show (no beforeinstallprompt on iOS)
      setShow(true)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShow(false)
      }
      setDeferredPrompt(null)
    }
    // For iOS, just dismiss — user sees instructions
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#E9D8C5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'Heebo, sans-serif',
        direction: 'rtl',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Image
          src="/icons/logo.png"
          alt="סופרזול"
          width={100}
          height={100}
          style={{ borderRadius: '22px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        />
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: '1.8rem',
          fontWeight: 800,
          color: '#4F483F',
          margin: '0 0 0.5rem',
          textAlign: 'center',
        }}
      >
        סופרזול
      </h1>
      <p
        style={{
          fontSize: '1rem',
          color: '#7A6E65',
          margin: '0 0 2.5rem',
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        השוואת מחירים בסופרמרקטים
      </p>

      {/* iOS instructions */}
      {isIOS && (
        <div
          style={{
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            color: '#4F483F',
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: '280px',
          }}
        >
          להתקנה: לחץ על{' '}
          <span style={{ fontSize: '1.1rem' }}>⎙</span> ואז{' '}
          <strong>"הוסף למסך הבית"</strong>
        </div>
      )}

      {/* Install button (Android) */}
      {!isIOS && (
        <button
          onClick={handleInstall}
          style={{
            width: '100%',
            maxWidth: '280px',
            padding: '0.9rem',
            background: '#4F483F',
            color: '#E9D8C5',
            border: 'none',
            borderRadius: '14px',
            fontSize: '1.05rem',
            fontWeight: 700,
            fontFamily: 'Heebo, sans-serif',
            cursor: 'pointer',
            marginBottom: '0.75rem',
          }}
        >
          📲 התקן את האפליקציה
        </button>
      )}

      {/* Continue to web */}
      <button
        onClick={handleDismiss}
        style={{
          width: '100%',
          maxWidth: '280px',
          padding: '0.9rem',
          background: 'transparent',
          color: '#7A6E65',
          border: '1.5px solid #B6AB9C',
          borderRadius: '14px',
          fontSize: '1rem',
          fontFamily: 'Heebo, sans-serif',
          cursor: 'pointer',
        }}
      >
        המשך לגרסת האתר
      </button>
    </div>
  )
}
