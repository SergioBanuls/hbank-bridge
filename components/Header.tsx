/**
 * Header Component
 *
 * Top navigation bar with logo and wallet info.
 */

'use client';

import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConnectionContext } from '@/contexts/ConnectionContext';
import { SessionActionButtons } from './SessionActionButtons';

const NAV_ITEMS = [
  { href: '/', label: 'Bridge' },
  { href: '/transfer', label: 'Transfer', requiresAuth: true },
  { href: '/portfolio', label: 'Portfolio' },
] as const;

const getNavLinkClassName = (isActive: boolean, disabled: boolean) => {
  const baseClasses = 'px-6 py-2 rounded-full font-semibold transition-colors';
  const activeClasses = 'bg-white/10 text-white';
  const inactiveClasses = 'text-white/60 hover:text-white hover:bg-white/5';
  const disabledClasses = 'text-white/60 cursor-not-allowed opacity-50';

  if (disabled) return `${baseClasses} ${disabledClasses}`;
  return `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;
};

export const Header = memo(function Header() {
  const pathname = usePathname();
  const { isConnected } = useConnectionContext()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950 backdrop-blur-sm">
      <div className="mx-auto py-2 px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Navigation */}
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center -space-y-2.5">
              <Image
                src="/hbank-logo.png"
                alt="Hbank"
                width={132}
                height={48}
                priority
              />
              <span className="text-[10px] font-medium uppercase tracking-[0.35em] bg-gradient-to-r from-white/40 via-white/90 to-white/40 bg-clip-text text-transparent select-none">
                bridge
              </span>
            </div>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-2 ml-4">
              {NAV_ITEMS.map(({ href, label }) => {
                const isActive = href === '/'
                  ? pathname === '/' || pathname === '/bridge'
                  : pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={getNavLinkClassName(isActive, false)}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <SessionActionButtons />

        </div >
      </div >
    </header >
  );
})