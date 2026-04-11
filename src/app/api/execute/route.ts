import { NextRequest, NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  maxUint256,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Config ───
const API_KEY = process.env.OKX_API_KEY || "";
const SECRET_KEY = process.env.OKX_SECRET_KEY || "";
const PASSPHRASE = process.env.OKX_API_PASSPHRASE || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_OKX_PROJECT_ID || "";
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || "";
const DCA_AGENT_ADDRESS = (process.env.NEXT_PUBLIC_DCA_AGENT_ADDRESS || "") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech";
const DEX_APPROVE_PROXY = "0x8b773d83bc66be128c60e07e17c8901f7a64f000";

const xlayer = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const VAULT_ABI = parseAbi([
  "function pullTokensForSwap(address user) external",
  "function getStrategy(address user) external view returns (address,address,uint256,uint256,bool)",
  "function canExecute(address user) external view returns (bool)",
  "function getBalance(address user, address token) external view returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address,uint256) external returns (bool)",
  "function transfer(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address,address) external view returns (uint256)",
]);

function getOKXHeaders(timestamp: string, method: string, requestPath: string, queryString: string = "") {
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getOKXSwapData(fromToken: string, toToken: string, amount: string, walletAddr: string) {
  const apiPath = "/api/v6/dex/aggregator/swap";
  const params: Record<string, string> = {
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

  if (data.code !== "0" || !data.data?.[0]?.tx) {
    console.error("OKX DEX API error:", JSON.stringify(data));
    return null;
  }
  return data.data[0];
}

// POST /api/execute
export async function POST(request: NextRequest) {
  try {
    if (!AGENT_PRIVATE_KEY) {
      return NextResponse.json({ error: "Agent wallet not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { userAddress, action, fromToken, toToken, amount } = body;

    if (!userAddress) {
      return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
    }

    // Auto-register user for the keeper
    try {
      const fs = require("fs");
      const usersFile = "./known-users.json";
      let users: string[] = [];
      try { users = JSON.parse(fs.readFileSync(usersFile, "utf8")); } catch {}
      const addr = userAddress.toLowerCase();
      if (!users.includes(addr)) {
        users.push(addr);
        fs.writeFileSync(usersFile, JSON.stringify(users));
        console.log("[AUTO-REGISTER] New user added to keeper:", addr);
      }
    } catch {}

    const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: xlayer as any,
      transport: http(RPC_URL),
    });
    const publicClient = createPublicClient({
      chain: xlayer as any,
      transport: http(RPC_URL),
    });

    // ═══════════════════════════════════════
    //  ACTION: DCA EXECUTE
    // ═══════════════════════════════════════
    if (action === "dca") {
      // 1. Check canExecute
      const canExec = await publicClient.readContract({
        address: DCA_AGENT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "canExecute",
        args: [userAddress as `0x${string}`],
      });
      if (!canExec) {
        return NextResponse.json({ error: "Cannot execute: cooldown active or insufficient balance" }, { status: 400 });
      }

      // 2. Get strategy
      const strategy = await publicClient.readContract({
        address: DCA_AGENT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "getStrategy",
        args: [userAddress as `0x${string}`],
      });
      const [tokenIn, tokenOut, amountPerExec] = strategy as [string, string, bigint, bigint, boolean];

      console.log(`DCA: ${formatUnits(amountPerExec, 6)} tokenIn(${tokenIn}) → tokenOut(${tokenOut})`);

      // 3. Pull tokens from vault → Agentic Wallet
      console.log("Step 1: Pulling tokens from vault...");
      const pullTx = await walletClient.writeContract({
        chain: xlayer as any,
        address: DCA_AGENT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "pullTokensForSwap",
        args: [userAddress as `0x${string}`],
      });
      console.log("Pull tx:", pullTx);
      await sleep(5000); // Wait for tx to confirm

      // 4. Ensure Agentic Wallet has approved DEX approve proxy for tokenIn
      if (tokenIn.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        const allowance = await publicClient.readContract({
          address: tokenIn as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account.address, DEX_APPROVE_PROXY as `0x${string}`],
        });
        if ((allowance as bigint) < amountPerExec) {
          console.log("Step 2: Approving DEX approve proxy...");
          const approveTx = await walletClient.writeContract({
            chain: xlayer as any,
            address: tokenIn as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [DEX_APPROVE_PROXY as `0x${string}`, maxUint256],
          });
          console.log("Approve tx:", approveTx);
          await sleep(5000);
        }
      }

      // 5. Get swap calldata from OKX DEX (Agentic Wallet is the swapper)
      console.log("Step 3: Getting swap route from OKX DEX...");
      const swapData = await getOKXSwapData(tokenIn, tokenOut, amountPerExec.toString(), account.address);
      if (!swapData) {
        return NextResponse.json({ error: "Failed to get swap route from OKX DEX" }, { status: 500 });
      }

      // 6. Execute swap from Agentic Wallet
      console.log("Step 4: Executing swap...");
      const swapTx = await walletClient.sendTransaction({
        chain: xlayer as any,
        to: swapData.tx.to as `0x${string}`,
        data: swapData.tx.data as `0x${string}`,
        value: swapData.tx.value ? BigInt(swapData.tx.value) : BigInt(0),
      });
      console.log("Swap tx:", swapTx);
      await sleep(5000);

      // 7. Check how much tokenOut the Agentic Wallet received
      let receivedAmount: bigint;
      if (tokenOut.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        // Native OKB — skip sending back to vault for now (complex)
        receivedAmount = BigInt(0);
      } else {
        receivedAmount = (await publicClient.readContract({
          address: tokenOut as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        })) as bigint;
      }

      // 8. Send output tokens from Agentic Wallet → DCA Agent vault
      if (receivedAmount > BigInt(0) && tokenOut.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        console.log("Step 5: Sending output tokens back to vault...");
        const transferTx = await walletClient.writeContract({
          chain: xlayer as any,
          address: tokenOut as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [DCA_AGENT_ADDRESS, receivedAmount],
        });
        console.log("Transfer tx:", transferTx);
        await sleep(5000);

        // 9. Call completeDCA to credit user's vault balance
        console.log("Step 6: Crediting user vault balance...");
        const completeTx = await walletClient.writeContract({
          chain: xlayer as any,
          address: DCA_AGENT_ADDRESS,
          abi: parseAbi(["function completeDCA(address user, uint256 amountOut) external"]),
          functionName: "completeDCA",
          args: [userAddress as `0x${string}`, receivedAmount],
        });
        console.log("Complete tx:", completeTx);
        await sleep(3000);
      }

      return NextResponse.json({
        success: true,
        swapTxHash: swapTx,
        amountOut: receivedAmount.toString(),
        agenticWallet: account.address,
      });

    // ═══════════════════════════════════════
    //  ACTION: SWAP (e.g. WOKB back to USDC)
    //  Tokens are in the vault → pull → swap → send back → credit
    // ═══════════════════════════════════════
    } else if (action === "swap") {
      if (!fromToken || !toToken || !amount) {
        return NextResponse.json({ error: "Missing fromToken, toToken, or amount" }, { status: 400 });
      }

      const swapAmount = BigInt(amount);

      // 1. Check user has enough balance in vault
      const vaultBalance = (await publicClient.readContract({
        address: DCA_AGENT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "getBalance",
        args: [userAddress as `0x${string}`, fromToken as `0x${string}`],
      })) as bigint;

      if (vaultBalance < swapAmount) {
        return NextResponse.json({ error: `Insufficient vault balance. Have: ${vaultBalance.toString()}, need: ${amount}` }, { status: 400 });
      }

      // 2. Pull tokens from vault → Agentic Wallet
      console.log("Swap: Step 1 - Pulling tokens from vault...");
      const pullTx = await walletClient.writeContract({
        chain: xlayer as any,
        address: DCA_AGENT_ADDRESS,
        abi: parseAbi(["function pullTokens(address user, address token, uint256 amount) external"]),
        functionName: "pullTokens",
        args: [userAddress as `0x${string}`, fromToken as `0x${string}`, swapAmount],
      });
      console.log("Pull tx:", pullTx);
      await sleep(5000);

      // 3. Ensure approval for DEX approve proxy
      if (fromToken.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        const allowance = (await publicClient.readContract({
          address: fromToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [account.address, DEX_APPROVE_PROXY as `0x${string}`],
        })) as bigint;
        if (allowance < swapAmount) {
          console.log("Swap: Step 2 - Approving DEX...");
          await walletClient.writeContract({
            chain: xlayer as any,
            address: fromToken as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [DEX_APPROVE_PROXY as `0x${string}`, maxUint256],
          });
          await sleep(5000);
        }
      }

      // 4. Get swap data from OKX DEX
      console.log("Swap: Step 3 - Getting swap route...");
      const swapData = await getOKXSwapData(fromToken, toToken, amount, account.address);
      if (!swapData) {
        return NextResponse.json({ error: "Failed to get swap route" }, { status: 500 });
      }

      // 5. Execute swap from Agentic Wallet
      console.log("Swap: Step 4 - Executing swap...");
      const swapTx = await walletClient.sendTransaction({
        chain: xlayer as any,
        to: swapData.tx.to as `0x${string}`,
        data: swapData.tx.data as `0x${string}`,
        value: swapData.tx.value ? BigInt(swapData.tx.value) : BigInt(0),
      });
      console.log("Swap tx:", swapTx);
      await sleep(5000);

      // 6. Check received amount
      let receivedAmount: bigint = BigInt(0);
      if (toToken.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        receivedAmount = (await publicClient.readContract({
          address: toToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        })) as bigint;

        if (receivedAmount > BigInt(0)) {
          // 7. Transfer output tokens from Agentic Wallet → vault
          console.log("Swap: Step 5 - Sending output to vault...");
          await walletClient.writeContract({
            chain: xlayer as any,
            address: toToken as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [DCA_AGENT_ADDRESS, receivedAmount],
          });
          await sleep(5000);

          // 8. Credit user's vault balance
          console.log("Swap: Step 6 - Crediting user balance...");
          await walletClient.writeContract({
            chain: xlayer as any,
            address: DCA_AGENT_ADDRESS,
            abi: parseAbi(["function creditUser(address user, address token, uint256 amount) external"]),
            functionName: "creditUser",
            args: [userAddress as `0x${string}`, toToken as `0x${string}`, receivedAmount],
          });
          await sleep(3000);
        }
      }

      return NextResponse.json({
        success: true,
        swapTxHash: swapTx,
        amountOut: receivedAmount.toString(),
        agenticWallet: account.address,
      });

    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Execute API error:", error.shortMessage || error.message || error);
    return NextResponse.json({ error: error.shortMessage || error.message || "Internal error" }, { status: 500 });
  }
}
