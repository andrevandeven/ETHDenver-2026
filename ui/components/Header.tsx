"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <nav className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-zinc-100 hover:text-white">
            Negotiator iNFT
          </Link>
          <Link href="/rfq" className="text-sm text-zinc-400 hover:text-zinc-100">
            My RFQs
          </Link>
          <Link href="/rfq/new" className="text-sm text-zinc-400 hover:text-zinc-100">
            New RFQ
          </Link>
          <Link href="/mint" className="text-sm text-zinc-400 hover:text-zinc-100">
            Mint Agent
          </Link>
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}
