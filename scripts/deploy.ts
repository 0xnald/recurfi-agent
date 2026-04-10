const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "OKB");

  // The Agentic Wallet is an EOA that executes swaps
  // This should be the same key as AGENT_PRIVATE_KEY in .env
  const AGENTIC_WALLET = process.env.AGENTIC_WALLET_ADDRESS || deployer.address;

  console.log("Agentic Wallet:", AGENTIC_WALLET);

  console.log("\n--- Deploying DCAAgent V3 ---");
  const DCAAgent = await ethers.getContractFactory("DCAAgent");
  const agent = await DCAAgent.deploy(AGENTIC_WALLET);
  await agent.waitForDeployment();
  const agentAddr = await agent.getAddress();
  console.log("DCAAgent Vault:", agentAddr);

  const deployments = {
    chainId: 196, network: "xlayer",
    contracts: { DCAAgent: agentAddr },
    agenticWallet: AGENTIC_WALLET,
    deployer: deployer.address, 
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync("./deployments.json", JSON.stringify(deployments, null, 2));
  console.log("\n=== Deployment saved ===");
  console.log(JSON.stringify(deployments, null, 2));
  console.log("\nNext steps:");
  console.log("1. Set NEXT_PUBLIC_DCA_AGENT_ADDRESS=" + agentAddr + " in .env");
  console.log("2. Set AGENT_PRIVATE_KEY to the Agentic Wallet private key in .env");
  console.log("3. Fund the Agentic Wallet with a small amount of OKB for gas");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
