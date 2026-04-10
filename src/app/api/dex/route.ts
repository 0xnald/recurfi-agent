import { NextRequest, NextResponse } from "next/server";
import CryptoJS from "crypto-js";

const API_KEY = process.env.OKX_API_KEY || "";
const SECRET_KEY = process.env.OKX_SECRET_KEY || "";
const PASSPHRASE = process.env.OKX_API_PASSPHRASE || "";
const PROJECT_ID = process.env.NEXT_PUBLIC_OKX_PROJECT_ID || "";

function getHeaders(timestamp: string, method: string, requestPath: string, queryString: string = "", body: string = "") {
  const preHash = timestamp + method + requestPath + queryString + body;
  const sign = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(preHash, SECRET_KEY));
  return {
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-PASSPHRASE": PASSPHRASE,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PROJECT-ID": PROJECT_ID,
    "Content-Type": "application/json",
  };
}

// GET /api/dex?action=quote|swap|tokens&...params
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (!action) {
    return NextResponse.json({ error: "Missing action param" }, { status: 400 });
  }

  let apiPath = "";
  const params: Record<string, string> = {};

  switch (action) {
    case "quote":
      apiPath = "/api/v6/dex/aggregator/quote";
      params.chainIndex = searchParams.get("chainIndex") || "196";
      params.fromTokenAddress = searchParams.get("fromTokenAddress") || "";
      params.toTokenAddress = searchParams.get("toTokenAddress") || "";
      params.amount = searchParams.get("amount") || "";
      break;

    case "swap":
      apiPath = "/api/v6/dex/aggregator/swap";
      params.chainIndex = searchParams.get("chainIndex") || "196";
      params.fromTokenAddress = searchParams.get("fromTokenAddress") || "";
      params.toTokenAddress = searchParams.get("toTokenAddress") || "";
      params.amount = searchParams.get("amount") || "";
      params.slippagePercent = searchParams.get("slippagePercent") || "0.5";
      params.userWalletAddress = searchParams.get("userWalletAddress") || "";
      break;

    case "tokens":
      apiPath = "/api/v6/dex/aggregator/all-tokens";
      params.chainIndex = searchParams.get("chainIndex") || "196";
      break;

    case "chain":
      apiPath = "/api/v6/dex/aggregator/get-chain-data";
      params.chainIndex = searchParams.get("chainIndex") || "196";
      break;

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const queryString = "?" + new URLSearchParams(params).toString();
    const timestamp = new Date().toISOString();
    const headers = getHeaders(timestamp, "GET", apiPath, queryString);

    const response = await fetch(`https://web3.okx.com${apiPath}${queryString}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("OKX DEX API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
