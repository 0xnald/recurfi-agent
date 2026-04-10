const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("DCAAgent", function () {
  async function deployFixture() {
    const [owner, user, executor] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    const usdcAddr = await usdc.getAddress();
    const tokenOut = await MockUSDC.deploy();
    const tokenOutAddr = await tokenOut.getAddress();
    const DCAAgent = await ethers.getContractFactory("DCAAgent");
    const agent = await DCAAgent.deploy(owner.address);
    const agentAddr = await agent.getAddress();
    await usdc.mint(user.address, ethers.parseUnits("10000", 6));
    await usdc.connect(user).approve(agentAddr, ethers.MaxUint256);
    return { agent, agentAddr, usdc, usdcAddr, tokenOut, tokenOutAddr, owner, user, executor };
  }

  describe("Deposit", function () {
    it("should accept ERC20 deposits", async function () {
      const { agent, usdcAddr, user } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 6);
      await agent.connect(user).deposit(usdcAddr, amount);
      expect(await agent.getBalance(user.address, usdcAddr)).to.equal(amount);
    });

    it("should accept native OKB deposits", async function () {
      const { agent, user } = await loadFixture(deployFixture);
      await agent.connect(user).depositNative({ value: ethers.parseEther("1") });
      expect(await agent.getBalance(user.address, ethers.ZeroAddress)).to.equal(ethers.parseEther("1"));
    });

    it("should revert on zero deposit", async function () {
      const { agent, usdcAddr, user } = await loadFixture(deployFixture);
      await expect(agent.connect(user).deposit(usdcAddr, 0)).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Strategy", function () {
    it("should set a strategy", async function () {
      const { agent, usdcAddr, tokenOutAddr, user } = await loadFixture(deployFixture);
      await agent.connect(user).setStrategy(usdcAddr, tokenOutAddr, ethers.parseUnits("100", 6), 3600);
      const s = await agent.getStrategy(user.address);
      expect(s.tokenIn).to.equal(usdcAddr);
      expect(s.active).to.be.true;
    });

    it("should cancel a strategy", async function () {
      const { agent, usdcAddr, tokenOutAddr, user } = await loadFixture(deployFixture);
      await agent.connect(user).setStrategy(usdcAddr, tokenOutAddr, ethers.parseUnits("100", 6), 3600);
      await agent.connect(user).cancelStrategy();
      expect((await agent.getStrategy(user.address)).active).to.be.false;
    });

    it("should revert on same token", async function () {
      const { agent, usdcAddr, user } = await loadFixture(deployFixture);
      await expect(agent.connect(user).setStrategy(usdcAddr, usdcAddr, ethers.parseUnits("100", 6), 3600)).to.be.revertedWith("Same token");
    });
  });

  describe("canExecute", function () {
    it("should return true when ready", async function () {
      const { agent, usdcAddr, tokenOutAddr, user } = await loadFixture(deployFixture);
      await agent.connect(user).deposit(usdcAddr, ethers.parseUnits("1000", 6));
      await agent.connect(user).setStrategy(usdcAddr, tokenOutAddr, ethers.parseUnits("100", 6), 60);
      expect(await agent.canExecute(user.address)).to.be.true;
    });
  });

  describe("Events", function () {
    it("should emit Deposited", async function () {
      const { agent, usdcAddr, user } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("500", 6);
      await expect(agent.connect(user).deposit(usdcAddr, amount)).to.emit(agent, "Deposited").withArgs(user.address, usdcAddr, amount);
    });

    it("should emit StrategySet", async function () {
      const { agent, usdcAddr, tokenOutAddr, user } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("100", 6);
      await expect(agent.connect(user).setStrategy(usdcAddr, tokenOutAddr, amount, 3600)).to.emit(agent, "StrategySet");
    });
  });
});
