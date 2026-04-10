"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ArrowDownUp, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { TOKENS } from "@/config/contracts";
import { formatAmount, shortenAddress } from "@/lib/utils";
import { useVaultBalance, useWithdraw } from "@/hooks/useDCA";
import { toast } from "sonner";
import { parseUnits } from "viem";

export default function SwapPage() {
  const { address, isConnected } = useAccount();

  const [fromToken, setFromToken] = useState(TOKENS[3]); // WETH
  const [toToken, setToToken] = useState(TOKENS[1]);     // USDC
  const [amount, setAmount] = useState("");
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ txHash: string; agent: string } | null>(null);
  const [quote, setQuote] = useState<{ toAmount: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const { data: fromBalance } = useVaultBalance(fromToken.address);

  // Fetch quote
  useEffect(() => {
    if (!amount || Number(amount) <= 0 || fromToken.address === toToken.address) {
      setQuote(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const rawAmount = parseUnits(amount, fromToken.decimals).toString();
        const params = new URLSearchParams({
          action: "quote", chainIndex: "196",
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amount: rawAmount,
        });
        const res = await fetch(`/api/dex?${params}`);
        const data = await res.json();
        if (data.code === "0" && data.data?.[0]?.toTokenAmount) {
          setQuote({ toAmount: formatAmount(BigInt(data.data[0].toTokenAmount), toToken.decimals, 6) });
        } else { setQuote(null); }
      } catch { setQuote(null); }
      finally { setQuoteLoading(false); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [amount, fromToken, toToken]);

  const handleFlip = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
    setAmount("");
    setQuote(null);
  };

  const handleSwap = async () => {
    if (!address || !amount || Number(amount) <= 0) return;
    setError("");
    setResult(null);
    setExecuting(true);

    try {
      const rawAmount = parseUnits(amount, fromToken.decimals).toString();

      // Call server-side Agentic Wallet to execute swap
      // Note: tokens need to be in the vault first (user deposits from vault balance)
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          action: "swap",
          fromToken: fromToken.address,
          toToken: toToken.address,
          amount: rawAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Swap failed");
      }

      setResult({ txHash: data.swapTxHash, agent: data.agenticWallet });
      toast.success("Swap executed via Agentic Wallet!");
      setAmount("");
      setQuote(null);
    } catch (err: any) {
      console.error("Swap error:", err);
      setError(err.message || "Swap failed");
      toast.error("Swap failed");
    } finally {
      setExecuting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <ArrowDownUp className="mx-auto h-16 w-16 text-silver-dark mb-4" />
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Swap</h1>
        <p className="mt-2 text-muted-foreground">Connect your wallet to swap tokens.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Swap</h1>
        <p className="mt-2 text-muted-foreground">
          Swap tokens via the Agentic Wallet using OKX DEX Aggregator — swap DCA output back to USDC.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-border/50 bg-card p-6">
        {result ? (
          <div className="text-center py-6">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success mb-3" />
            <h2 className="font-display text-lg font-bold text-foreground">Swap Complete!</h2>
            <p className="mt-1 text-xs text-muted-foreground">via Agentic Wallet: {shortenAddress(result.agent, 6)}</p>
            <a
              href={`https://www.oklink.com/xlayer/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-silver-dark hover:text-silver"
            >
              tx: {shortenAddress(result.txHash, 8)}
            </a>
            <button
              onClick={() => setResult(null)}
              className="mt-4 block mx-auto text-sm text-muted-foreground hover:text-foreground"
            >
              New Swap
            </button>
          </div>
        ) : (
          <>
            {/* From */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">From (vault balance)</label>
              <div className="flex gap-2">
                <select
                  value={fromToken.address}
                  onChange={(e) => { const t = TOKENS.find(t => t.address === e.target.value); if (t) setFromToken(t); }}
                  className="w-32 rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
                >
                  {TOKENS.map(t => (<option key={t.address} value={t.address}>{t.symbol}</option>))}
                </select>
                <input
                  type="number" placeholder="0.0" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none text-right"
                />
              </div>
              {fromBalance && (
                <p className="text-xs text-muted-foreground">
                  Vault: {formatAmount(fromBalance as bigint, fromToken.decimals, 4)} {fromToken.symbol}
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <button onClick={handleFlip} className="rounded-full border border-border/50 bg-accent p-2 text-muted-foreground hover:text-foreground transition-colors">
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            {/* To */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <div className="flex gap-2">
                <select
                  value={toToken.address}
                  onChange={(e) => { const t = TOKENS.find(t => t.address === e.target.value); if (t) setToToken(t); }}
                  className="w-32 rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
                >
                  {TOKENS.map(t => (<option key={t.address} value={t.address}>{t.symbol}</option>))}
                </select>
                <div className="flex-1 rounded-md border border-border/50 bg-accent/50 px-3 py-2 text-sm text-right">
                  {quoteLoading ? <span className="text-muted-foreground">Loading...</span>
                    : quote ? <span className="text-foreground">{quote.toAmount}</span>
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>

            {quote && amount && (
              <div className="rounded-md bg-accent/50 p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Rate</span>
                  <span className="text-foreground">1 {fromToken.symbol} ≈ {(Number(quote.toAmount) / Number(amount)).toFixed(4)} {toToken.symbol}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Executor</span>
                  <span className="text-foreground">Agentic Wallet</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSwap}
              disabled={executing || !amount || Number(amount) <= 0 || fromToken.address === toToken.address}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-silver-dark to-silver py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {executing ? <><Loader2 className="h-4 w-4 animate-spin" /> Swapping via Agent...</> : <><ArrowDownUp className="h-4 w-4" /> Swap</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
