"use client";

import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { DCA_AGENT_ABI, ERC20_ABI } from "@/abi/DCAAgent";
import { CONTRACTS, TOKENS } from "@/config/contracts";

const agentAddress = CONTRACTS.DCA_AGENT;

export function useStrategy() {
  const { address } = useAccount();
  return useReadContract({
    address: agentAddress,
    abi: DCA_AGENT_ABI,
    functionName: "getStrategy",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

export function useVaultBalance(tokenAddress?: `0x${string}`) {
  const { address } = useAccount();
  return useReadContract({
    address: agentAddress,
    abi: DCA_AGENT_ABI,
    functionName: "getBalance",
    args: address && tokenAddress ? [address, tokenAddress] : undefined,
    query: { enabled: !!address && !!tokenAddress },
  });
}

export function useCanExecute() {
  const { address } = useAccount();
  return useReadContract({
    address: agentAddress,
    abi: DCA_AGENT_ABI,
    functionName: "canExecute",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

export function useLastExecution() {
  const { address } = useAccount();
  return useReadContract({
    address: agentAddress,
    abi: DCA_AGENT_ABI,
    functionName: "lastExecution",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

export function useTotalExecutions() {
  return useReadContract({
    address: agentAddress,
    abi: DCA_AGENT_ABI,
    functionName: "totalExecutions",
  });
}

export function useDeposit() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = (tokenAddress: `0x${string}`, amount: bigint) => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "deposit",
      args: [tokenAddress, amount],
    });
  };

  const depositNative = (amount: bigint) => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "depositNative",
      value: amount,
    });
  };

  return { deposit, depositNative, hash, isPending, isConfirming, isSuccess, error };
}

export function useApproveToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (tokenAddress: `0x${string}`, amount: bigint) => {
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [agentAddress, amount],
    });
  };

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

export function useSetStrategy() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const setStrategy = (
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountPerExec: bigint,
    interval: number
  ) => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "setStrategy",
      args: [tokenIn, tokenOut, amountPerExec, BigInt(interval)],
    });
  };

  return { setStrategy, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelStrategy() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = () => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "cancelStrategy",
    });
  };

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}


export function useWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = (tokenAddress: `0x${string}`, amount: bigint) => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "withdraw",
      args: [tokenAddress, amount],
    });
  };

  const withdrawNative = (amount: bigint) => {
    writeContract({
      address: agentAddress,
      abi: DCA_AGENT_ABI,
      functionName: "withdrawNative",
      args: [amount],
    });
  };

  return { withdraw, withdrawNative, hash, isPending, isConfirming, isSuccess, error };
}

export function useTokenAllowance(tokenAddress?: `0x${string}`) {
  const { address } = useAccount();
  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, agentAddress] : undefined,
    query: { enabled: !!address && !!tokenAddress },
  });
}

export function useTokenBalance(tokenAddress?: `0x${string}`) {
  const { address } = useAccount();
  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!tokenAddress },
  });
}
