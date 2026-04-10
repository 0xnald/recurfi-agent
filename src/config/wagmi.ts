"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { xlayer, xlayerTestnet } from "./contracts";

export const wagmiConfig = getDefaultConfig({
  appName: "RecurFi - Smart DCA Agent",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [xlayer, xlayerTestnet],
  ssr: true,
});
