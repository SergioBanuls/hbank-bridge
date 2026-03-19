'use client';

import { Token } from '@/types/token';
import Image from 'next/image';
import { ReactNode } from 'react';

interface TokenSelectorProps {
  label: string;
  selectedToken: Token | null;
  onClick?: () => void;
  badge?: ReactNode;
}

export function TokenSelector({ label, selectedToken, onClick, badge }: TokenSelectorProps) {
  const inner = (
    <>
      <h3 className="text-sm font-bold mb-2">{label}</h3>
      <div className="flex items-center gap-3">
        {selectedToken ? (
          <>
            <div className="relative w-10 h-10 shrink-0">
              <div className="relative w-10 h-10 rounded-full overflow-hidden">
                <Image
                  src={selectedToken.icon || '/NotFound.png'}
                  alt={selectedToken.symbol}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              {badge && (
                <div className="absolute -bottom-1 -right-1">{badge}</div>
              )}
            </div>
            <div className="flex flex-col items-start flex-1">
              <span className="text-white text-md font-semibold">{selectedToken.symbol}</span>
              <span className="text-white/50 text-xs">{selectedToken.name}</span>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
            <div className="flex flex-col items-start flex-1">
              <span className="text-white/40 text-sm font-medium">Select a Token</span>
            </div>
          </>
        )}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="w-full bg-neutral-800 rounded-2xl px-4 py-4 h-26 text-left">
        {inner}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full bg-neutral-800 rounded-2xl px-4 py-2 h-26 group text-left"
    >
      {inner}
    </button>
  );
}

