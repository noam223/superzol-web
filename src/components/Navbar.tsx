'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/',              label: 'מבצעים',           icon: '/icons/fire_small.png' },
  { href: '/compare',       label: 'השוואת מחירים',   icon: '/icons/compare.png'  },
  { href: '/shopping-list', label: '',                 icon: '/icons/cart.png', isCenter: true },
  { href: '/search',        label: 'חיפוש',            icon: '/icons/search.png'   },
  { href: '/profile',       label: 'פרופיל',           icon: '/icons/profile.png'  },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(233, 216, 197, 0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 -4px 24px rgba(79, 72, 63, 0.15)',
        borderTop: '1px solid rgba(182, 171, 156, 0.4)',
        height: '80px',
      }}
    >
      <div className="flex items-end justify-around h-full px-2 pb-2">
        {NAV_ITEMS.map(({ href, label, icon, isCenter }) => {
          const isActive = pathname === href || (href === '/' && pathname === '/');

          if (isCenter) {
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center relative"
                style={{ marginBottom: '18px' }}
              >
                {/* Elevated circle for cart */}
                <div
                  className="animate-cart-bounce"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    boxShadow: '0 6px 20px rgba(79, 72, 63, 0.25)',
                    border: '3px solid rgba(255,255,255,0.8)',
                    background: 'white',
                  }}
                >
                  <Image
                    src={icon}
                    alt="עגלה"
                    width={72}
                    height={72}
                    style={{ objectFit: 'cover', objectPosition: 'top' }}
                    priority
                  />
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 pb-1"
              style={{ minWidth: 52 }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  overflow: 'hidden',
                  opacity: isActive ? 1 : 0.75,
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all 0.2s ease',
                  filter: isActive ? 'drop-shadow(0 2px 6px rgba(79,72,63,0.3))' : 'none',
                }}
              >
                <Image
                  src={icon}
                  alt={label}
                  width={44}
                  height={44}
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isActive ? '#4F483F' : '#8a7f75',
                  fontFamily: 'Rubik, Heebo, sans-serif',
                  lineHeight: 1,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
