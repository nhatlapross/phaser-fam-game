/**
 * CyberCatService - CyberCat Backend API Integration + Smart Contract
 * Manages CyberCat claiming, retrieval, and updates via backend API
 * Also handles on-chain agent registration via ERC-8004
 */

import { UserService } from "./UserService";
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

// CyberCat ABI (mintCat from FriendCards contract)
const CYBERCAT_ABI = [
    {
        type: "function",
        name: "mintCat",
        inputs: [{ name: "catType", type: "uint256", internalType: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
] as const;

// Map catType (1-7) → pet sprite key used in game
export const CAT_TYPE_TO_SPRITE: Record<number, string> = {
    1: "kungfu-master",
    2: "cowboy",
    3: "explorer",
    4: "bullfighter",
    5: "soccer-player",
    6: "ninja",
    7: "nurse",
};

export interface MintCatResult {
    success: boolean;
    catType?: number;
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
     * Mint a CyberCat NFT by calling mintCat(uint256 catType) on-chain.
     * @param catType - Cat type 1–7
     */
    static async mintCat(catType: number): Promise<MintCatResult> {
        try {
            console.log("🐱 Minting CyberCat type:", catType);

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

            console.log("📝 Sending mintCat transaction...");

            const txHash = await walletClient.writeContract({
                address: contractAddress,
                abi: CYBERCAT_ABI,
                functionName: "mintCat",
                args: [BigInt(catType)],
                account,
            });

            console.log("⏳ Waiting for transaction confirmation...");

            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status === "reverted") {
                return { success: false, txHash, error: "Transaction reverted." };
            }

            console.log("✅ CyberCat minted!", { catType, txHash });

            const chainName = chain.name;
            const explorerBaseUrl = chain.blockExplorers?.default?.url ?? '';

            return { success: true, catType, txHash, chainName, explorerBaseUrl };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error occurred";
            console.error("❌ CyberCatService.mintCat error:", err);
            return { success: false, error: message };
        }
    }

    /**
     * Mint CyberCat NFT using FriendCards contract (ERC-1155)
     * @param catType - Cat type (1-7)
     */
    static async mintCatNFT(catType: CatType): Promise<RegisterAgentResult> {
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
            }) as bigint;

            return Number(balance);
        } catch (error) {
            console.error(
                "❌ CyberCatService.getFriendCardBalances error:",
                error,
            );
            return {
                success: false,
                error: "Cannot connect to server",
            };
        }
    }
}

