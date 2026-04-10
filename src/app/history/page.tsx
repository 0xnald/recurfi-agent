"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbiItem, type Log } from "viem";
import { ArrowRightLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { CONTRACTS, TOKENS } from "@/config/contracts";
import { formatAmount, shortenAddress } from "@/lib/utils";

interface TxEvent {
  type: string;
  detail: string;
  hash: string;
  blockNumber: bigint;
}

const findToken = (addr: string) =>
  TOKENS.find(t => t.address.toLowerCase() === addr.toLowerCase());

// X Layer RPC limits getLogs to 100 blocks per request
// We chunk backwards from the current block
const CHUNK_SIZE = BigInt(99);
const MAX_CHUNKS = 50; // scan ~5000 blocks back

async function getLogsChunked(
  publicClient: any,
  params: { address: `0x${string}`; event: any; args: any },
  currentBlock: bigint
): Promise<Log[]> {
  const allLogs: Log[] = [];
  let toBlock = currentBlock;

  for (let i = 0; i < MAX_CHUNKS; i++) {
    const fromBlock = toBlock > CHUNK_SIZE ? toBlock - CHUNK_SIZE : BigInt(0);
    if (fromBlock > toBlock) break;

    try {
      const logs = await publicClient.getLogs({
        ...params,
        fromBlock,
        toBlock,
      });
      allLogs.push(...logs);
    } catch (e) {
      // Skip failed chunks silently
    }

    if (fromBlock === BigInt(0)) break;
    toBlock = fromBlock - BigInt(1);
  }

  return allLogs;
}

export default function HistoryPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<TxEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanInfo, setScanInfo] = useState("");

  const fetchEvents = useCallback(async () => {
    if (!address || !publicClient) return;
    setLoading(true);
    setScanInfo("Scanning blocks...");

    try {
      const currentBlock = await publicClient.getBlockNumber();
      setScanInfo(`Scanning from block ${(currentBlock - CHUNK_SIZE * BigInt(MAX_CHUNKS)).toString()} to ${currentBlock.toString()}...`);

      const allEvents: TxEvent[] = [];
      const contractAddr = CONTRACTS.DCA_AGENT;

      // 1. DCAExecuted events
      const dcaLogs = await getLogsChunked(publicClient, {
        address: contractAddr,
        event: parseAbiItem("event DCAExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp)"),
        args: { user: address },
      }, currentBlock);

      for (const log of dcaLogs) {
        const args = (log as any).args;
        const tIn = findToken(args.tokenIn || "");
        const tOut = findToken(args.tokenOut || "");
        allEvents.push({
          type: "DCA Executed",
          detail: `${tIn ? formatAmount(args.amountIn || BigInt(0), tIn.decimals, 2) : "?"} ${tIn?.symbol || "?"} → ${tOut ? formatAmount(args.amountOut || BigInt(0), tOut.decimals, 6) : "?"} ${tOut?.symbol || "?"}`,
          hash: log.transactionHash || "",
          blockNumber: log.blockNumber || BigInt(0),
        });
      }

      // 2. Deposited events
      const depositLogs = await getLogsChunked(publicClient, {
        address: contractAddr,
        event: parseAbiItem("event Deposited(address indexed user, address indexed token, uint256 amount)"),
        args: { user: address },
      }, currentBlock);

      for (const log of depositLogs) {
        const args = (log as any).args;
        const token = findToken(args.token || "");
        allEvents.push({
          type: "Deposit",
          detail: token ? `${formatAmount(args.amount || BigInt(0), token.decimals, 2)} ${token.symbol}` : `${args.amount?.toString() || "?"}`,
          hash: log.transactionHash || "",
          blockNumber: log.blockNumber || BigInt(0),
        });
      }

      // 3. Withdrawn events
      const withdrawLogs = await getLogsChunked(publicClient, {
        address: contractAddr,
        event: parseAbiItem("event Withdrawn(address indexed user, address indexed token, uint256 amount)"),
        args: { user: address },
      }, currentBlock);

      for (const log of withdrawLogs) {
        const args = (log as any).args;
        const token = findToken(args.token || "");
        allEvents.push({
          type: "Withdrawal",
          detail: token ? `${formatAmount(args.amount || BigInt(0), token.decimals, 2)} ${token.symbol}` : `${args.amount?.toString() || "?"}`,
          hash: log.transactionHash || "",
          blockNumber: log.blockNumber || BigInt(0),
        });
      }

      // 4. StrategySet events
      const strategyLogs = await getLogsChunked(publicClient, {
        address: contractAddr,
        event: parseAbiItem("event StrategySet(address indexed user, address tokenIn, address tokenOut, uint256 amountPerExec, uint256 interval)"),
        args: { user: address },
      }, currentBlock);

      for (const log of strategyLogs) {
        const args = (log as any).args;
        const tIn = findToken(args.tokenIn || "");
        const tOut = findToken(args.tokenOut || "");
        allEvents.push({
          type: "Strategy Set",
          detail: `${tIn ? formatAmount(args.amountPerExec || BigInt(0), tIn.decimals, 2) : "?"} ${tIn?.symbol || "?"} → ${tOut?.symbol || "?"} every ${Number(args.interval || 0) / 3600}h`,
          hash: log.transactionHash || "",
          blockNumber: log.blockNumber || BigInt(0),
        });
      }

      // 5. StrategyCancelled events
      const cancelLogs = await getLogsChunked(publicClient, {
        address: contractAddr,
        event: parseAbiItem("event StrategyCancelled(address indexed user)"),
        args: { user: address },
      }, currentBlock);

      for (const log of cancelLogs) {
        allEvents.push({
          type: "Strategy Cancelled",
          detail: "—",
          hash: log.transactionHash || "",
          blockNumber: log.blockNumber || BigInt(0),
        });
      }

      // Sort newest first
      allEvents.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      // Dedupe by tx hash + type
      const seen = new Set<string>();
      const deduped = allEvents.filter(e => {
        const key = `${e.hash}-${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setEvents(deduped);
      setScanInfo(`Found ${deduped.length} transactions (scanned ${(CHUNK_SIZE * BigInt(MAX_CHUNKS)).toString()} blocks)`);
    } catch (err: any) {
      console.error("Error fetching events:", err);
      setScanInfo(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (!isConnected) {
    return (
      <div className="animate-fade-in py-20 text-center">
        <ArrowRightLeft className="mx-auto h-16 w-16 text-silver-dark mb-4" />
        <h1 className="font-display text-3xl font-bold text-gradient-silver">Transaction History</h1>
        <p className="mt-2 text-muted-foreground">Connect your wallet to view your history.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient-silver">Transaction History</h1>
          <p className="mt-2 text-muted-foreground">All DCA executions, deposits, and withdrawals — fully verifiable onchain.</p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="rounded-md border border-border/50 p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {scanInfo && (
        <p className="text-xs text-muted-foreground">{scanInfo}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-silver" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-card p-12 text-center">
          <p className="text-muted-foreground">No transactions found. Deposit funds and set up a strategy to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50 bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Details</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Block</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {events.map((tx, i) => (
                <tr key={`${tx.hash}-${i}`} className="border-b border-border/30 transition-colors hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-silver-dark" />
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{tx.detail}</td>
                  <td className="px-4 py-3 text-muted-foreground">#{tx.blockNumber.toString()}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://www.oklink.com/xlayer/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-silver-dark transition-colors hover:text-silver"
                    >
                      <code className="text-xs">{shortenAddress(tx.hash, 6)}</code>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
