/**
 * CyberCatService - Pet Agent Registration Service
 * Register pet agents using ERC-8004 Identity Registry (same as DefiMaster)
 */

import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    type EIP1193Provider,
    type Chain,
} from "viem";
import { arbitrumSepolia } from "viem/chains";
import { creditcoin } from "../config/privy";
import { EventBus } from "./EventBus";

// CyberCat contract address per chain
const CYBERCAT_CONTRACTS: Record<number, `0x${string}`> = {
    [arbitrumSepolia.id]:
        (process.env.NEXT_PUBLIC_CYBERCAT_CONTRACT as `0x${string}`) ??
        "0x4748FEB6Fb3335476154df7da978A48769509eF1",
    [creditcoin.id]:
        (process.env.NEXT_PUBLIC_CREADIT_COIN_CYBERCAT_CONTRACT as `0x${string}`) ??
        "0x4B9BB9d553faEA260f8d69CB7F9Dd7503b0D8c3b",
};

const CHAIN_CONFIG: Record<number, Chain> = {
    [arbitrumSepolia.id]: arbitrumSepolia,
    [creditcoin.id]: creditcoin,
};

// ERC-8004 ABI
const CYBERCAT_ABI = [
    {
        type: "function",
        name: "register",
        inputs: [{ name: "agentURI", type: "string" }],
        outputs: [{ name: "agentId", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getAgentURI",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
    },
] as const;

export interface RegisterPetResult {
    success: boolean;
    agentId?: string;
    txHash?: string;
    chainName?: string;
    explorerBaseUrl?: string;
    error?: string;
}

export class CyberCatService {
    private static activeChainId: number = arbitrumSepolia.id;

    static {
        EventBus.on("chain-changed", ({ chainId }: { chainId: number }) => {
            CyberCatService.activeChainId = chainId;
        });
    }

    /**
     * Request EIP-1193 provider from React layer via EventBus
     */
    private static getProvider(): Promise<EIP1193Provider> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                EventBus.off("eth-provider-response");
                reject(
                    new Error(
                        "Wallet provider not available. Please connect your wallet.",
                    ),
                );
            }, 5000);

            EventBus.once(
                "eth-provider-response",
                (provider: EIP1193Provider | null) => {
                    clearTimeout(timeout);
                    if (provider) {
                        resolve(provider);
                    } else {
                        reject(new Error("No wallet connected."));
                    }
                },
            );

            EventBus.emit("request-eth-provider");
        });
    }

    /**
     * Register a pet agent using ERC-8004
     * @param petType - Pet type identifier (e.g., "kungfu-master", "cowboy", etc.)
     */
    static async registerPet(petType: string): Promise<RegisterPetResult> {
        try {
            console.log("🐱 Registering CyberCat agent:", petType);

            const chainId = CyberCatService.activeChainId;
            const chain = CHAIN_CONFIG[chainId];
            const contractAddress = CYBERCAT_CONTRACTS[chainId];

            if (!chain || !contractAddress) {
                return { success: false, error: `Unsupported chain: ${chainId}` };
            }

            const provider = await this.getProvider();

            const walletClient = createWalletClient({
                chain,
                transport: custom(provider),
            });

            const publicClient = createPublicClient({
                chain,
                transport: http(),
            });

            const [account] = await walletClient.getAddresses();
            if (!account) {
                return { success: false, error: "No account found in wallet." };
            }

            console.log("📝 Sending register transaction...");

            // Register pet agent with petType as agentURI
            const txHash = await walletClient.writeContract({
                address: contractAddress,
                abi: CYBERCAT_ABI,
                functionName: "register",
                args: [petType],
                account,
            });

            console.log("⏳ Waiting for transaction confirmation...");

            // Wait for transaction receipt
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
            });

            if (receipt.status === "reverted") {
                return {
                    success: false,
                    txHash,
                    error: "Transaction reverted.",
                };
            }

            // Extract agentId from logs
            let agentId: string | undefined;
            if (receipt.logs.length > 0) {
                const log = receipt.logs[0];
                if (log.topics[1]) {
                    agentId = BigInt(log.topics[1]).toString();
                }
            }

            console.log("✅ Pet agent registered successfully!", {
                agentId,
                txHash,
            });

            const chainName = chain.name;
            const explorerBaseUrl = chain.blockExplorers?.default?.url ?? '';

            return { success: true, agentId, txHash, chainName, explorerBaseUrl };
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Unknown error occurred";
            console.error("❌ CyberCatService.registerPet error:", err);
            return { success: false, error: message };
        }
    }

    /**
     * Get number of agents owned by address
     */
    static async getAgentCount(address: string): Promise<number> {
        try {
            const chainId = CyberCatService.activeChainId;
            const chain = CHAIN_CONFIG[chainId] ?? arbitrumSepolia;
            const contractAddress = CYBERCAT_CONTRACTS[chainId] ?? CYBERCAT_CONTRACTS[arbitrumSepolia.id];

            const publicClient = createPublicClient({
                chain,
                transport: http(),
            });

            const balance = await publicClient.readContract({
                address: contractAddress,
                abi: CYBERCAT_ABI,
                functionName: "balanceOf",
                args: [address as `0x${string}`],
            });

            return Number(balance);
        } catch (error) {
            console.error("❌ Error getting agent count:", error);
            return 0;
        }
    }
}

