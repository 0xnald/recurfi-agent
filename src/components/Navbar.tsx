"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/strategy", label: "Strategy" },
  { href: "/execute", label: "Execute" },
  { href: "/swap", label: "Swap" },
  { href: "/history", label: "History" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/recurfi-logo.jpg" alt="RecurFi" width={32} height={32} className="rounded-md" />
          <span className="font-display text-xl font-bold text-gradient-silver">RecurFi</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                pathname === item.href && "text-foreground bg-accent"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <button
                  onClick={connected ? openAccountModal : openConnectModal}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all",
                    connected
                      ? "border border-silver-dark/30 text-silver hover:bg-accent"
                      : "bg-gradient-to-r from-silver-dark to-silver text-primary-foreground hover:opacity-90"
                  )}
                >
                  {connected ? account.displayName : "Connect Wallet"}
                </button>
              );
            }}
          </ConnectButton.Custom>

          <button className="text-muted-foreground md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/50 bg-background px-4 py-3 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                pathname === item.href && "text-foreground bg-accent"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
