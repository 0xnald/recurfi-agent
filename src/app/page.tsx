"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { Wallet, TrendingUp, Repeat, ArrowDownToLine, Loader2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useStrategy, useVaultBalance, useCanExecute, useLastExecution, useTotalExecutions, useDeposit, useApproveToken, useTokenAllowance, useWithdraw } from "@/hooks/useDCA";
import { TOKENS } from "@/config/contracts";
import { formatAmount } from "@/lib/utils";
import { toast } from "sonner";

const USDC = TOKENS.find(t => t.symbol === "USDC")!;

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: strategy } = useStrategy();
  const { data: usdcBalance } = useVaultBalance(USDC.address);
  const { data: canExec } = useCanExecute();
  const { data: lastExec } = useLastExecution();
  const { data: totalExecs } = useTotalExecutions();
  const { data: allowance } = useTokenAllowance(USDC.address);

  const { deposit, depositNative, isPending: depositPending, isSuccess: depositSuccess } = useDeposit();
  const { approve, isPending: approvePending } = useApproveToken();
  const { withdraw, isPending: withdrawPending } = useWithdraw();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const balanceStr = usdcBalance ? formatAmount(usdcBalance as bigint, USDC.decimals, 2) : "0.00";

  const strategyActive = strategy && (strategy as any).active;
  const tokenOut = strategyActive ? TOKENS.find(t => t.address.toLowerCase() === ((strategy as any).tokenOut as string).toLowerCase()) : null;
  const amountPerExec = strategyActive ? formatAmount((strategy as any).amountPerExec as bigint, USDC.decimals, 2) : "0";

  const nextDCA = (() => {
    if (!strategyActive || !lastExec) return "—";
    const last = Number(lastExec);
    const interval = Number((strategy as any).interval);
    if (last === 0) return "Now";
    const next = last + interval;
    const now = Math.floor(Date.now() / 1000);
    const diff = next - now;
    if (diff <= 0) return "Now";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `~${h}h ${m}m`;
  })();

  const handleDeposit = () => {
    if (!depositAmount || Number(depositAmount) <= 0) return;
    const amount = parseUnits(depositAmount, USDC.decimals);
    if (!allowance || (allowance as bigint) < amount) {
      approve(USDC.address, amount);
      toast.info("Approving USDC... please confirm then deposit again.");
      return;
    }
    deposit(USDC.address, amount);
    toast.success("Deposit submitted!");
    setDepositAmount("");
    setShowDeposit(false);
  };

  const handleWithdraw = () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return;
    const amount = parseUnits(withdrawAmount, USDC.decimals);
    withdraw(USDC.address, amount);
    toast.success("Withdrawal submitted!");
    setWithdrawAmount("");
    setShowWithdraw(false);
  };

  if (!isConnected) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center py-20 text-center">
        <Wallet className="h-16 w-16 text-silver-dark mb-4" />
        <h1 className="font-display text-4xl font-bold text-gradient-silver">Smart DCA Agent</h1>
        <p className="mt-3 text-muted-foreground max-w-md">
          Fully onchain dollar-cost averaging — autonomous, transparent, verifiable. Connect your wallet to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold text-gradient-silver sm:text-5xl">Smart DCA Agent</h1>
        <p className="mt-3 text-muted-foreground">
          Fully onchain dollar-cost averaging — autonomous, transparent, verifiable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Deposited" value={`${balanceStr} USDC`} sub="Available balance" />
        <StatCard icon={TrendingUp} label="Total Executions" value={totalExecs ? totalExecs.toString() : "0"} sub="Protocol-wide" />
        <StatCard icon={Repeat} label="Strategy" value={strategyActive ? `${amountPerExec} USDC` : "None"} sub={strategyActive ? `Per exec → ${tokenOut?.symbol || "?"}` : "Set up a strategy"} />
        <StatCard icon={ArrowDownToLine} label="Next DCA" value={nextDCA} sub={strategyActive ? `Interval: ${Number((strategy as any).interval) / 3600}h` : "—"} />
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-border/50 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Quick Actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Deposit funds or manage your vault balance.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => { setShowDeposit(!showDeposit); setShowWithdraw(false); }}
            className="rounded-md bg-gradient-to-r from-silver-dark to-silver px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 text-sm"
          >
            Deposit USDC
          </button>
          <button
            onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false); }}
            className="rounded-md border border-silver-dark/30 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Withdraw
          </button>
        </div>

        {showDeposit && (
          <div className="mt-4 flex gap-2 max-w-sm">
            <input
              type="number"
              placeholder="Amount (USDC)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
            />
            <button
              onClick={handleDeposit}
              disabled={depositPending || approvePending}
              className="rounded-md bg-gradient-to-r from-silver-dark to-silver px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {depositPending || approvePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </button>
          </div>
        )}

        {showWithdraw && (
          <div className="mt-4 flex gap-2 max-w-sm">
            <input
              type="number"
              placeholder="Amount (USDC)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="flex-1 rounded-md border border-border/50 bg-accent px-3 py-2 text-sm text-foreground outline-none"
            />
            <button
              onClick={handleWithdraw}
              disabled={withdrawPending}
              className="rounded-md border border-silver-dark/30 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {withdrawPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
