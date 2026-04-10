/**
 * RecurFi DCA Keeper
 * 
 * This script runs continuously and auto-executes DCA strategies
 * for all users when their cooldown expires.
 * 
 * Run: node scripts/keeper.js
 * Or with PM2: pm2 start scripts/keeper.js --name recurfi-keeper
 */

require("dotenv").config();
const {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  maxUint256,
  formatUnits,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const CryptoJS = require("crypto-js");

// ─── Config ───
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const DCA_AGENT_ADDRESS = process.env.NEXT_PUBLIC_DCA_AGENT_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech";
const API_KEY = process.env.OKX_API_KEY || "";
const SECRET_KEY = process.env.OKX_SECRET_KEY || "";
const PASSPHRASE = process.env.OKX_API_PASSPHRASE || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_OKX_PROJECT_ID || "";
const DEX_APPROVE_PROXY = "0x8b773d83bc66be128c60e07e17c8901f7a64f000";

// How often to check (in ms) — check every 30 seconds
const CHECK_INTERVAL = 30_000;

// Track known users (in production, you'd scan events or use a database)
const KNOWN_USERS_FILE = "./known-users.json";

if (!AGENT_PRIVATE_KEY || !DCA_AGENT_ADDRESS) {
  console.error("Missing AGENT_PRIVATE_KEY or NEXT_PUBLIC_DCA_AGENT_ADDRESS in .env");
  process.exit(1);
}

const chain = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const account = privateKeyToAccount(AGENT_PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

const VAULT_ABI = parseAbi([
  "function canExecute(address user) external view returns (bool)",
  "function getStrategy(address user) external view returns (address,address,uint256,uint256,bool)",
  "function pullTokensForSwap(address user) external",
  "function completeDCA(address user, uint256 amountOut) external",
  "event StrategySet(address indexed user, address tokenIn, address tokenOut, uint256 amountPerExec, uint256 interval)",
  "event StrategyCancelled(address indexed user)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address,uint256) external returns (bool)",
  "function transfer(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address,address) external view returns (uint256)",
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getOKXHeaders(timestamp, method, requestPath, queryString = "") {
  const sign = CryptoJS.enc.Base64.stringify(
    CryptoJS.HmacSHA256(timestamp + method + requestPath + queryString, SECRET_KEY)
  );
  return {
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-PASSPHRASE": PASSPHRASE,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PROJECT-ID": PROJECT_ID,
    "Content-Type": "application/json",
  };
}

async function getOKXSwapData(fromToken, toToken, amount, walletAddr) {
  const apiPath = "/api/v6/dex/aggregator/swap";
  const params = {
    chainIndex: "196",
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    amount,
    slippagePercent: "3",
    userWalletAddress: walletAddr,
  };
  const queryString = "?" + new URLSearchParams(params).toString();
  const timestamp = new Date().toISOString();
  const headers = getOKXHeaders(timestamp, "GET", apiPath, queryString);

  const response = await fetch(`https://web3.okx.com${apiPath}${queryString}`, {
    method: "GET",
    headers,
  });
  const data = await response.json();
  if (data.code !== "0" || !data.data?.[0]?.tx) return null;
  return data.data[0];
}

// ─── Load/save known users ───
let knownUsers = new Set();

function loadUsers() {
  try {
    const fs = require("fs");
    if (fs.existsSync(KNOWN_USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KNOWN_USERS_FILE, "utf8"));
      knownUsers = new Set(data);
    }
  } catch {}
}

function saveUsers() {
  try {
    const fs = require("fs");
    fs.writeFileSync(KNOWN_USERS_FILE, JSON.stringify([...knownUsers]));
  } catch {}
}

// ─── Scan for new users via recent StrategySet events ───
async function scanForNewUsers() {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > BigInt(99) ? currentBlock - BigInt(99) : BigInt(0);

    const logs = await publicClient.getLogs({
      address: DCA_AGENT_ADDRESS,
      event: parseAbi(["event StrategySet(address indexed user, address tokenIn, address tokenOut, uint256 amountPerExec, uint256 interval)"])[0],
      fromBlock,
      toBlock: "latest",
    });

    for (const log of logs) {
      const user = log.args?.user;
      if (user && !knownUsers.has(user)) {
        knownUsers.add(user);
        console.log(`[KEEPER] New user discovered: ${user}`);
        saveUsers();
      }
    }
  } catch (err) {
    // Silently skip scan errors (RPC rate limits etc)
  }
}

// ─── Execute DCA for a single user ───
async function executeDCAForUser(userAddress) {
  try {
    // 1. Check canExecute
    const canExec = await publicClient.readContract({
      address: DCA_AGENT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "canExecute",
      args: [userAddress],
    });

    if (!canExec) return false;

    // 2. Get strategy
    const strategy = await publicClient.readContract({
      address: DCA_AGENT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getStrategy",
      args: [userAddress],
    });
    const [tokenIn, tokenOut, amountPerExec, interval, active] = strategy;
    if (!active) return false;

    console.log(`[KEEPER] Executing DCA for ${userAddress}: ${formatUnits(amountPerExec, 6)} tokenIn → tokenOut`);

    // 3. Pull tokens from vault
    console.log("[KEEPER] Pulling tokens from vault...");
    const pullTx = await walletClient.writeContract({
      chain,
      address: DCA_AGENT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "pullTokensForSwap",
      args: [userAddress],
    });
    console.log("[KEEPER] Pull tx:", pullTx);
    await sleep(5000);

    // 4. Approve DEX if needed
    if (tokenIn.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
      const allowance = await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, DEX_APPROVE_PROXY],
      });
      if (allowance < amountPerExec) {
        console.log("[KEEPER] Approving DEX...");
        await walletClient.writeContract({
          chain,
          address: tokenIn,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [DEX_APPROVE_PROXY, maxUint256],
        });
        await sleep(5000);
      }
    }

    // 5. Get swap route
    console.log("[KEEPER] Getting swap route...");
    const swapData = await getOKXSwapData(tokenIn, tokenOut, amountPerExec.toString(), account.address);
    if (!swapData) {
      console.error("[KEEPER] Failed to get swap route");
      return false;
    }

    // 6. Execute swap
    console.log("[KEEPER] Executing swap...");
    const swapTx = await walletClient.sendTransaction({
      chain,
      to: swapData.tx.to,
      data: swapData.tx.data,
      value: swapData.tx.value ? BigInt(swapData.tx.value) : BigInt(0),
    });
    console.log("[KEEPER] Swap tx:", swapTx);
    await sleep(5000);

    // 7. Check received and send back to vault
    let receivedAmount = BigInt(0);
    if (tokenOut.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
      receivedAmount = await publicClient.readContract({
        address: tokenOut,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      });

      if (receivedAmount > BigInt(0)) {
        console.log("[KEEPER] Transferring output to vault...");
        await walletClient.writeContract({
          chain,
          address: tokenOut,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [DCA_AGENT_ADDRESS, receivedAmount],
        });
        await sleep(5000);

        console.log("[KEEPER] Crediting user...");
        await walletClient.writeContract({
          chain,
          address: DCA_AGENT_ADDRESS,
          abi: VAULT_ABI,
          functionName: "completeDCA",
          args: [userAddress, receivedAmount],
        });
        await sleep(3000);
      }
    }

    console.log(`[KEEPER] ✅ DCA executed for ${userAddress}. Received: ${receivedAmount.toString()}`);
    return true;
  } catch (err) {
    console.error(`[KEEPER] ❌ Error executing DCA for ${userAddress}:`, err.shortMessage || err.message);
    return false;
  }
}

// ─── Main Loop ───
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  RecurFi DCA Keeper Started");
  console.log("═══════════════════════════════════════");
  console.log("Agent Wallet:", account.address);
  console.log("Vault Contract:", DCA_AGENT_ADDRESS);
  console.log("Check Interval:", CHECK_INTERVAL / 1000, "seconds");
  console.log("═══════════════════════════════════════\n");

  loadUsers();
  console.log(`[KEEPER] Loaded ${knownUsers.size} known users`);

  while (true) {
    try {
      // Scan for new users
      await scanForNewUsers();

      // Check each user
      for (const user of knownUsers) {
        await executeDCAForUser(user);
      }
    } catch (err) {
      console.error("[KEEPER] Loop error:", err.message);
    }

    await sleep(CHECK_INTERVAL);
  }
}

main();
