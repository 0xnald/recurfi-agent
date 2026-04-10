"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { Settings, Zap, Loader2, XCircle } from "lucide-react";
import { useSetStrategy, useStrategy, useCancelStrategy, useVaultBalance } from "@/hooks/useDCA";
import { TOKENS, INTERVALS } from "@/config/contracts";
import { formatAmount } from "@/lib/utils";
import { toast } from "sonner";

const USDC = TOKENS.find(t => t.symbol === "USDC")!;
const buyableTokens = TOKENS.filter(t => t.symbol !== "USDC" && t.symbol !== "USDT");

export default function StrategyPage() {
  const { isConnected } = useAccount();
  const { data: strategy } = useStrategy();
  const { data: balance } = useVaultBalance(USDC.address);
  const { setStrategy, isPending, isConfirming, isSuccess, error } = useSetStrategy();
  const { cancel, isPending: cancelPending } = useCancelStrategy();

  const [tokenOut, setTokenOut] = useState(buyableTokens[0]?.address || "");
  const [amount, setAmount] = useState("200");
  const [interval, setInterval] = useState(86400);

  const strategyActive = strategy && (strategy as any).active;

  useEffect(() => {
    if (isSuccess) toast.success("Strategy set successfully!");
  }, [isSuccess]);

  const handleSubmit = () => {
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const amountBigInt = parseUnits(amount, USDC.decimals);
    setStrategy(USDC.address, tokenOut as `0x${string}`, amountBigInt, interval);
  };

  const handleCancel = () => {
    cancel();
    toast.info("Cancelling strategy...");
  };

  if (!isConnected) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <Settings className="mx-auto h-16 w-16 text-silver-dark mb-4" />
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Strategy Setup</h1>
        <p className="mt-2 text-muted-foreground">Connect your wallet to configure a DCA strategy.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Strategy Setup</h1>
        <p className="mt-2 text-muted-foreground">Configure your DCA strategy — choose token, amount, and interval.</p>
      </div>

      {strategyActive && (
        <div className="mx-auto max-w-lg rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-success font-medium">Active Strategy: </span>
              <span className="text-foreground">
                {formatAmount((strategy as any).amountPerExec, USDC.decimals, 2)} USDC →{" "}
                {TOKENS.find(t => t.address.toLowerCase() === ((strategy as any).tokenOut as string).toLowerCase())?.symbol || "?"}{" "}
                every {Number((strategy as any).interval) / 3600}h
              </span>
            </div>
            <button
              onClick={handleCancel}
              disabled={cancelPending}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <XCircle className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg space-y-6 rounded-lg border border-border/50 bg-card p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Token to Buy</label>
          <select
            value={tokenOut}
            onChange={(e) => setTokenOut(e.target.value as `0x${string}`)}
            className="w-full rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
          >
            {buyableTokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol} — {t.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Amount per Execution (USDC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
            placeholder="e.g. 200"
          />
          {balance && (
            <p className="text-xs text-muted-foreground">
              Vault balance: {formatAmount(balance as bigint, USDC.decimals, 2)} USDC
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Interval</label>
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="w-full rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        <div className="rounded-md bg-accent/50 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4 text-silver-dark" />
            <span>
              Buy <strong className="text-foreground">{buyableTokens.find(t => t.address === tokenOut)?.symbol}</strong>{" "}
              with <strong className="text-foreground">{amount} USDC</strong>{" "}
              every <strong className="text-foreground">{INTERVALS.find(i => i.value === interval)?.label}</strong>
            </span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive">Error: {(error as any).shortMessage || error.message}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isPending || isConfirming}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-silver-dark to-silver py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending || isConfirming ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Confirming...</>
          ) : (
            <><Zap className="h-4 w-4" /> Set Strategy</>
          )}
        </button>
      </div>
    </div>
  );
}
