import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientWrapper } from "./client-wrapper";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Procurement Negotiator iNFT",
  description: "AI-powered on-chain procurement agent on 0G Chain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen`}>
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
