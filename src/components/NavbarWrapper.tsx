'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

// Pages where the bottom nav should NOT appear
const HIDDEN_PATHS = ['/login'];

export default function NavbarWrapper() {
  const pathname = usePathname();

  if (HIDDEN_PATHS.includes(pathname)) return null;

  return <Navbar />;
}
