"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Repeat, CheckCircle2, Clock, Zap, Loader2, AlertCircle } from "lucide-react";
import { useStrategy, useCanExecute, useVaultBalance, useLastExecution } from "@/hooks/useDCA";
import { TOKENS, CONTRACTS } from "@/config/contracts";
import { formatAmount, shortenAddress } from "@/lib/utils";
import { toast } from "sonner";

const USDC = TOKENS.find(t => t.symbol === "USDC")!;

export default function ExecutePage() {
  const { address, isConnected } = useAccount();
  const { data: strategy, refetch: refetchStrategy } = useStrategy();
  const { data: canExec, refetch: refetchCanExec } = useCanExecute();
  const { data: balance } = useVaultBalance(USDC.address);

  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ txHash: string; amountOut: string; agent: string } | null>(null);
  const [error, setError] = useState("");
  const [quoteInfo, setQuoteInfo] = useState("");

  const strategyActive = strategy && (strategy as any).active;
  const tokenOut = strategyActive
    ? TOKENS.find(t => t.address.toLowerCase() === ((strategy as any).tokenOut as string).toLowerCase())
    : null;
  const amountPerExec = strategyActive ? (strategy as any).amountPerExec as bigint : BigInt(0);

  // Fetch quote
  useEffect(() => {
    if (!strategyActive || !address) return;
    const fetchQuote = async () => {
      try {
        const params = new URLSearchParams({
          action: "quote", chainIndex: "196",
          fromTokenAddress: (strategy as any).tokenIn,
          toTokenAddress: (strategy as any).tokenOut,
          amount: amountPerExec.toString(),
        });
        const res = await fetch(`/api/dex?${params}`);
        const data = await res.json();
        if (data.code === "0" && data.data?.[0]?.toTokenAmount && tokenOut) {
          setQuoteInfo(formatAmount(BigInt(data.data[0].toTokenAmount), tokenOut.decimals, 6));
        }
      } catch {}
    };
    fetchQuote();
  }, [strategyActive, address]);

  const handleExecute = async () => {
    if (!address || !strategyActive) return;
    setError("");
    setResult(null);
    setExecuting(true);

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, action: "dca" }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Execution failed");
      }

      setResult({
        txHash: data.swapTxHash,
        amountOut: data.amountOut,
        agent: data.agenticWallet,
      });

      toast.success("DCA executed via Agentic Wallet!");
      refetchStrategy();
      refetchCanExec();
    } catch (err: any) {
      console.error("Execute error:", err);
      setError(err.message || "Failed to execute DCA");
      toast.error("Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <Zap className="mx-auto h-16 w-16 text-silver-dark mb-4" />
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Execute DCA</h1>
        <p className="mt-2 text-muted-foreground">Connect your wallet to execute DCA swaps.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Execute DCA</h1>
        <p className="mt-2 text-muted-foreground">
          Trigger your next DCA — the Agentic Wallet pulls tokens from your vault, swaps via OKX DEX, and deposits output back.
        </p>
      </div>

      <div className="mx-auto max-w-lg rounded-lg border border-border/50 bg-card p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent">
          {result ? (
            <CheckCircle2 className="h-10 w-10 text-success" />
          ) : executing ? (
            <Repeat className="h-10 w-10 animate-spin text-silver" />
          ) : (
            <Zap className="h-10 w-10 text-silver" />
          )}
        </div>

        {result ? (
          <>
            <h2 className="font-display text-xl font-bold text-foreground">Swap Complete!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatAmount(amountPerExec, USDC.decimals, 2)} USDC → {tokenOut?.symbol || "?"}
              {tokenOut && result.amountOut !== "0" && (
                <> ({formatAmount(BigInt(result.amountOut), tokenOut.decimals, 6)} {tokenOut.symbol})</>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Executed by Agentic Wallet: {shortenAddress(result.agent, 6)}
            </p>
            <a
              href={`https://www.oklink.com/xlayer/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded bg-accent px-3 py-1 text-xs text-silver-dark hover:text-silver transition-colors"
            >
              swap tx: {shortenAddress(result.txHash, 8)}
            </a>
            <button
              onClick={() => { setResult(null); refetchCanExec(); }}
              className="mt-4 block mx-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Execute Again
            </button>
          </>
        ) : !strategyActive ? (
          <>
            <h2 className="font-display text-xl font-bold text-foreground">No Active Strategy</h2>
            <p className="mt-2 text-sm text-muted-foreground">Set up a DCA strategy first.</p>
            <a href="/strategy" className="mt-4 inline-block rounded-md bg-gradient-to-r from-silver-dark to-silver px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Set Strategy
            </a>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl font-bold text-foreground">
              {executing ? "Agentic Wallet Executing..." : "Ready to Execute"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {executing
                ? "Pulling tokens → swapping via OKX DEX → depositing output"
                : `Strategy: ${formatAmount(amountPerExec, USDC.decimals, 2)} USDC → ${tokenOut?.symbol}`}
            </p>

            {executing && (
              <div className="mt-4 space-y-2 text-left text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-silver" />
                  <span>1. Pulling tokens from vault to Agentic Wallet...</span>
                </div>
                <div className="flex items-center gap-2 opacity-50">
                  <div className="h-3 w-3" />
                  <span>2. Swapping via OKX Onchain OS DEX Aggregator...</span>
                </div>
                <div className="flex items-center gap-2 opacity-50">
                  <div className="h-3 w-3" />
                  <span>3. Depositing output tokens back to vault...</span>
                </div>
              </div>
            )}

            {!executing && (
              <div className="mt-6 space-y-2 rounded-md bg-accent/50 p-4 text-left text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-foreground">{formatAmount(amountPerExec, USDC.decimals, 2)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token Out</span>
                  <span className="text-foreground">{tokenOut?.symbol || "?"}</span>
                </div>
                {quoteInfo && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. Output</span>
                    <span className="text-foreground">{quoteInfo} {tokenOut?.symbol}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Executor</span>
                  <span className="text-foreground">Agentic Wallet (EOA)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Router</span>
                  <span className="text-foreground">OKX Onchain OS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cooldown</span>
                  <span className={`flex items-center gap-1 ${canExec ? "text-success" : "text-destructive"}`}>
                    <Clock className="h-3 w-3" /> {canExec ? "Ready" : "Cooling down"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vault Balance</span>
                  <span className="text-foreground">{balance ? formatAmount(balance as bigint, USDC.decimals, 2) : "0"} USDC</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-left text-xs text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={executing || !canExec}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-silver-dark to-silver py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {executing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Executing...</>
              ) : (
                <><Zap className="h-4 w-4" /> Execute DCA</>
              )}
            </button>
          </>
        )}
      </div>

      <div className="mx-auto max-w-lg rounded-md border border-border/30 bg-card/50 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Vault Contract:</strong> {CONTRACTS.DCA_AGENT}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <strong>Flow:</strong> Vault → Agentic Wallet (EOA) → OKX DEX Swap → Agentic Wallet → Vault.
          The Agentic Wallet is the onchain identity executing all swaps. Strategy rules are enforced by the vault contract.
        </p>
      </div>
    </div>
  );
}
