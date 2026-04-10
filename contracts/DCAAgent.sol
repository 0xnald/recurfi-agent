// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RecurFi DCA Agent V3 - Smart Dollar Cost Averaging on X Layer
/// @notice Vault contract that tracks user deposits, strategies, and balances.
///         The Agentic Wallet (an EOA) executes swaps via OKX DEX externally,
///         then reports results back to this contract.
/// @dev Architecture:
///   1. Users deposit tokens into this vault
///   2. Users set DCA strategies (token pair, amount, interval)
///   3. Agentic Wallet EOA pulls tokens from vault, swaps via OKX DEX, deposits output back
///   4. All accounting is onchain and verifiable
contract DCAAgent is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Strategy {
        address tokenIn;
        address tokenOut;
        uint256 amountPerExec;
        uint256 interval;
        bool active;
    }

    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => Strategy) public strategies;
    mapping(address => uint256) public lastExecution;
    uint256 public totalExecutions;

    /// @notice The Agentic Wallet EOA that executes swaps
    address public agenticWallet;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event StrategySet(address indexed user, address tokenIn, address tokenOut, uint256 amountPerExec, uint256 interval);
    event StrategyCancelled(address indexed user);
    event DCAExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestamp);
    event AgenticWalletUpdated(address indexed wallet);
    event TokensPulled(address indexed user, address indexed token, uint256 amount);
    event TokensReturned(address indexed user, address indexed token, uint256 amount);

    modifier onlyAgent() {
        require(msg.sender == agenticWallet || msg.sender == owner(), "Not agent");
        _;
    }

    constructor(address _agenticWallet) Ownable(msg.sender) {
        agenticWallet = _agenticWallet;
    }

    function setAgenticWallet(address _wallet) external onlyOwner {
        agenticWallet = _wallet;
        emit AgenticWalletUpdated(_wallet);
    }

    // ─── User Functions ───

    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    function depositNative() external payable nonReentrant {
        require(msg.value > 0, "Amount must be > 0");
        balances[msg.sender][address(0)] += msg.value;
        emit Deposited(msg.sender, address(0), msg.value);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    function withdrawNative(uint256 amount) external nonReentrant {
        require(balances[msg.sender][address(0)] >= amount, "Insufficient balance");
        balances[msg.sender][address(0)] -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, address(0), amount);
    }

    function setStrategy(address tokenIn, address tokenOut, uint256 amountPerExec, uint256 interval) external {
        require(tokenIn != tokenOut, "Same token");
        require(amountPerExec > 0, "Amount must be > 0");
        require(interval >= 60, "Min interval 60s");
        strategies[msg.sender] = Strategy(tokenIn, tokenOut, amountPerExec, interval, true);
        emit StrategySet(msg.sender, tokenIn, tokenOut, amountPerExec, interval);
    }

    function cancelStrategy() external {
        strategies[msg.sender].active = false;
        emit StrategyCancelled(msg.sender);
    }

    // ─── Agentic Wallet Functions ───

    /// @notice Generic: Agentic Wallet pulls any token from a user's vault balance
    /// @dev Used for swap-back (e.g. WOKB → USDC). Only callable by Agentic Wallet.
    function pullTokens(address user, address token, uint256 amount) external onlyAgent nonReentrant {
        require(balances[user][token] >= amount, "Insufficient balance");
        balances[user][token] -= amount;

        if (token == address(0)) {
            (bool ok, ) = payable(agenticWallet).call{value: amount}("");
            require(ok, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(agenticWallet, amount);
        }

        emit TokensPulled(user, token, amount);
    }

    /// @notice Generic: Credit user's vault balance with tokens already transferred to vault
    /// @dev Used after swap-back. Agentic Wallet transfers tokens to vault, then calls this.
    function creditUser(address user, address token, uint256 amount) external onlyAgent nonReentrant {
        balances[user][token] += amount;
        emit TokensReturned(user, token, amount);
    }

    /// @notice Step 1: Agentic Wallet pulls tokenIn from vault to itself for swapping
    /// @dev Only callable by the Agentic Wallet EOA
    function pullTokensForSwap(address user) external onlyAgent nonReentrant {
        Strategy memory s = strategies[user];
        require(s.active, "No active strategy");
        require(block.timestamp >= lastExecution[user] + s.interval, "Too early");
        require(balances[user][s.tokenIn] >= s.amountPerExec, "Insufficient balance");

        balances[user][s.tokenIn] -= s.amountPerExec;

        if (s.tokenIn == address(0)) {
            (bool ok, ) = payable(agenticWallet).call{value: s.amountPerExec}("");
            require(ok, "Transfer failed");
        } else {
            IERC20(s.tokenIn).safeTransfer(agenticWallet, s.amountPerExec);
        }

        emit TokensPulled(user, s.tokenIn, s.amountPerExec);
    }

    /// @notice Step 2: After swapping via OKX DEX, Agentic Wallet deposits output tokens back
    /// @dev Only callable by the Agentic Wallet EOA
    function reportSwapResult(address user, uint256 amountOut) external payable onlyAgent nonReentrant {
        Strategy memory s = strategies[user];
        require(s.active, "No active strategy");

        // Agentic Wallet transfers the output tokens to this contract
        if (s.tokenOut == address(0)) {
            require(msg.value >= amountOut, "Insufficient native");
            balances[user][s.tokenOut] += amountOut;
        } else {
            IERC20(s.tokenOut).safeTransferFrom(agenticWallet, address(this), amountOut);
            balances[user][s.tokenOut] += amountOut;
        }

        lastExecution[user] = block.timestamp;
        totalExecutions++;

        emit TokensReturned(user, s.tokenOut, amountOut);
        emit DCAExecuted(user, s.tokenIn, s.tokenOut, s.amountPerExec, amountOut, block.timestamp);
    }

    /// @notice Step 3: After swap, credit user with output tokens (already transferred to vault)
    /// @dev Only callable by Agentic Wallet. Call AFTER pullTokensForSwap + swap + transfer back.
    function completeDCA(address user, uint256 amountOut) external onlyAgent nonReentrant {
        Strategy memory s = strategies[user];
        require(s.active, "No active strategy");

        // Credit output tokens (already transferred to contract by Agentic Wallet)
        balances[user][s.tokenOut] += amountOut;

        lastExecution[user] = block.timestamp;
        totalExecutions++;

        emit DCAExecuted(user, s.tokenIn, s.tokenOut, s.amountPerExec, amountOut, block.timestamp);
    }

    // ─── View Functions ───

    function getStrategy(address user) external view returns (Strategy memory) { return strategies[user]; }
    function getBalance(address user, address token) external view returns (uint256) { return balances[user][token]; }

    function canExecute(address user) external view returns (bool) {
        Strategy memory s = strategies[user];
        if (!s.active) return false;
        if (block.timestamp < lastExecution[user] + s.interval) return false;
        if (balances[user][s.tokenIn] < s.amountPerExec) return false;
        return true;
    }

    receive() external payable {}
}
