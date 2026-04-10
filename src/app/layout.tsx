import type { Metadata } from "next";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecurFi - Smart DCA Agent on X Layer",
  description: "Fully onchain dollar-cost averaging — autonomous, transparent, verifiable. Built on X Layer with OKX Onchain OS & Uniswap.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <div className="grid-bg flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
              {children}
            </main>
            <Footer />
          </div>
          <Toaster theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
