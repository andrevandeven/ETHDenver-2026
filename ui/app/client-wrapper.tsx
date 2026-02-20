"use client";

import dynamic from "next/dynamic";

// WalletConnect accesses localStorage at init — must be client-only (no SSR)
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
});

export function ClientWrapper({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
