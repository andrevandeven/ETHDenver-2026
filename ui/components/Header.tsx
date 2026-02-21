"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { wagmiConfig, zgGalileo } from "@/lib/wagmi";

function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (isConnected && chainId !== zgGalileo.id) {
    return (
      <button
        disabled={isSwitching}
        onClick={() => switchChain({ chainId: zgGalileo.id })}
        className="text-sm px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white disabled:opacity-50"
      >
        {isSwitching ? "Switching…" : "Switch to 0G Galileo"}
      </button>
    );
  }

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="text-sm px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500"
      >
        {address?.slice(0, 6)}…{address?.slice(-4)}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error.message}</span>}
      <button
        disabled={isPending}
        onClick={() => connect({ connector: wagmiConfig.connectors[0] })}
        className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}

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
