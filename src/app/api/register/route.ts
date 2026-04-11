import { NextRequest, NextResponse } from "next/server";

// POST /api/register
// Body: { userAddress: "0x..." }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress } = body;

    if (!userAddress) {
      return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
    }

    const fs = require("fs");
    const usersFile = "./known-users.json";
    let users: string[] = [];
    try {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch {}

    const addr = userAddress.toLowerCase();
    if (!users.includes(addr)) {
      users.push(addr);
      fs.writeFileSync(usersFile, JSON.stringify(users));
      console.log("[REGISTER] New user:", addr);
    }

    return NextResponse.json({ success: true, totalUsers: users.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
