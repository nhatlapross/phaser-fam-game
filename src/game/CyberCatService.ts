/**
 * CyberCatService - Pet NFT Contract Service
 * Call smart contract để mint/adopt pet NFT khi mở Lucky Box
 */

import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    type EIP1193Provider,
} from "viem";
import { arbitrumSepolia } from "viem/chains";
import { EventBus } from "./EventBus";

// CyberCat NFT Contract Address (update with your deployed contract)
const CYBERCAT_CONTRACT_ADDRESS =
    (process.env.NEXT_PUBLIC_CYBERCAT_CONTRACT as `0x${string}`) ??
    "0x0000000000000000000000000000000000000000"; // TODO: Update with real address

// CyberCat Contract ABI - Minimal functions needed
const CYBERCAT_ABI = [
    {
        type: "function",
        name: "mint",
        inputs: [
            { name: "to", type: "address" },
            { name: "petType", type: "string" },
        ],
        outputs: [{ name: "tokenId", type: "uint256" }],
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
        name: "tokenURI",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
    },
] as const;

export interface MintPetResult {
    success: boolean;
    tokenId?: string;
    txHash?: string;
    error?: string;
}

export class CyberCatService {
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
     * Mint a new pet NFT
     * @param petType - Pet type identifier (e.g., "kungfu-master", "cowboy", etc.)
     */
    static async mintPet(petType: string): Promise<MintPetResult> {
        try {
            console.log("🐱 Minting CyberCat NFT:", petType);

            const provider = await this.getProvider();

            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            const publicClient = createPublicClient({
                chain: arbitrumSepolia,
                transport: http(),
            });

            const [account] = await walletClient.getAddresses();
            if (!account) {
                return { success: false, error: "No account found in wallet." };
            }

            console.log("📝 Sending mint transaction...");

            // Send mint transaction
            const txHash = await walletClient.writeContract({
                address: CYBERCAT_CONTRACT_ADDRESS,
                abi: CYBERCAT_ABI,
                functionName: "mint",
                args: [account, petType],
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

            // Extract tokenId from logs
            let tokenId: string | undefined;
            if (receipt.logs.length > 0) {
                const log = receipt.logs[0];
                if (log.topics[1]) {
                    tokenId = BigInt(log.topics[1]).toString();
                }
            }

            console.log("✅ Pet NFT minted successfully!", {
                tokenId,
                txHash,
            });

            return { success: true, tokenId, txHash };
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Unknown error occurred";
            console.error("❌ CyberCatService.mintPet error:", err);
            return { success: false, error: message };
        }
    }

    /**
     * Get number of pets owned by address
     */
    static async getPetCount(address: string): Promise<number> {
        try {
            const provider = await this.getProvider();

            const publicClient = createPublicClient({
                chain: arbitrumSepolia,
                transport: http(),
            });

            const balance = await publicClient.readContract({
                address: CYBERCAT_CONTRACT_ADDRESS,
                abi: CYBERCAT_ABI,
                functionName: "balanceOf",
                args: [address as `0x${string}`],
            });

            return Number(balance);
        } catch (error) {
            console.error("❌ Error getting pet count:", error);
            return 0;
        }
    }
}

