import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    hardhat: {},
    xlayer: { url: "https://rpc.xlayer.tech", chainId: 196, accounts: [PRIVATE_KEY] },
    xlayerTestnet: { url: "https://testrpc.xlayer.tech", chainId: 195, accounts: [PRIVATE_KEY] },
  },
  etherscan: {
    apiKey: { xlayer: process.env.OKLINK_API_KEY || "", xlayerTestnet: process.env.OKLINK_API_KEY || "" },
    customChains: [
      { network: "xlayer", chainId: 196, urls: { apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER", browserURL: "https://www.oklink.com/xlayer" } },
      { network: "xlayerTestnet", chainId: 195, urls: { apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET", browserURL: "https://www.oklink.com/xlayer-test" } },
    ],
  },
};

export default config;
