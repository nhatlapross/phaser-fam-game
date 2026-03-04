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
} from "viem";
import { arbitrumSepolia } from "viem/chains";
import { EventBus } from "./EventBus";

// CyberCat uses ERC-8004 Identity Registry (same as DefiMaster)
const CYBERCAT_CONTRACT_ADDRESS =
    (process.env.NEXT_PUBLIC_CYBERCAT_CONTRACT as `0x${string}`) ??
    "0x27558E49D50E398C34e665A62d8f3DAcc1941449"; // Identity Registry

// FriendCards ERC-1155 contract for CyberCat NFTs
const FRIEND_CARDS_CONTRACT_ADDRESS =
    "0xF94bEBfC920990E284c28039A5359301578c6640" as `0x${string}`;

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
] as const;

// FriendCards ABI
const FRIEND_CARDS_ABI = [
    {
        type: "function",
        name: "mintCat",
        inputs: [{ name: "catType", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "hasClaimed",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getCatType",
        inputs: [{ name: "user", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
] as const;

// CyberCat types (1-7)
export type CatType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CyberCat {
    id: string;
    userId: string;
    catType: CatType;
    name?: string | null;
    level: number;
    xp: number;
    mood: string;
    lastFedAt?: string;
    stats?: {
        speed?: number;
        power?: number;
        luck?: number;
    };
}

export interface ClaimCatResponse {
    success: boolean;
    cat?: CyberCat;
    contractAddress?: string;
    chainId?: number;
    error?: string;
}

export interface GetCatResponse {
    success: boolean;
    cat?: CyberCat;
    onChain?: {
        catType: number;
        balances: number[];
    };
    error?: string;
}

export interface UpdateCatRequest {
    name?: string;
    mood?: string;
    lastFedAt?: string;
    stats?: {
        speed?: number;
        power?: number;
        luck?: number;
    };
}

export interface UpdateCatResponse {
    success: boolean;
    cat?: CyberCat;
    error?: string;
}

export interface RegisterAgentResult {
    success: boolean;
    agentId?: string;
    txHash?: string;
    error?: string;
}

export class CyberCatService {
    private static API_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/cat`;

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
     * Register a pet agent on-chain using ERC-8004
     * @param petType - Pet type identifier (e.g., "kungfu-master", "cowboy", etc.)
     */
    static async registerAgent(petType: string): Promise<RegisterAgentResult> {
        try {
            console.log("🐱 Registering CyberCat agent on-chain:", petType);

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

            console.log("📝 Sending register transaction...");

            // Register pet agent with petType as agentURI
            const txHash = await walletClient.writeContract({
                address: CYBERCAT_CONTRACT_ADDRESS,
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

            console.log("✅ Pet agent registered on-chain!", {
                agentId,
                txHash,
            });

            return { success: true, agentId, txHash };
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Unknown error occurred";
            console.error("❌ CyberCatService.registerAgent error:", err);
            return { success: false, error: message };
        }
    }

    /**
     * Mint CyberCat NFT using FriendCards contract (ERC-1155)
     * @param catType - Cat type (1-7)
     */
    static async mintCatNFT(catType: CatType): Promise<RegisterAgentResult> {
        try {
            console.log("🎨 Minting CyberCat NFT:", catType);

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

            // Check if user has already claimed
            const hasClaimed = await publicClient.readContract({
                address: FRIEND_CARDS_CONTRACT_ADDRESS,
                abi: FRIEND_CARDS_ABI,
                functionName: "hasClaimed",
                args: [account],
            });

            if (hasClaimed) {
                console.log("⚠️ User has already claimed a CyberCat NFT");
                return {
                    success: false,
                    error: "You have already claimed a CyberCat NFT",
                };
            }

            console.log("📝 Sending mintCat transaction...");

            // Mint CyberCat NFT
            const txHash = await walletClient.writeContract({
                address: FRIEND_CARDS_CONTRACT_ADDRESS,
                abi: FRIEND_CARDS_ABI,
                functionName: "mintCat",
                args: [BigInt(catType)],
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

            console.log("✅ CyberCat NFT minted!", { catType, txHash });

            return { success: true, txHash };
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : "Unknown error occurred";
            console.error("❌ CyberCatService.mintCatNFT error:", err);
            return { success: false, error: message };
        }
    }

    /**
     * Claim a new CyberCat (can only be done once per user)
     * @param catType - Cat type (1-7)
     */
    static async claimCat(catType: CatType): Promise<ClaimCatResponse> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: "Not logged in!" };
        }

        try {
            console.log("🐱 Claiming CyberCat:", catType);
            console.log("📡 Request:", {
                url: `${this.API_URL}/claim`,
                method: "POST",
                body: { catType },
                hasToken: !!token,
            });

            const response = await fetch(`${this.API_URL}/claim`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ catType }),
            });

            console.log("📡 Response status:", response.status);

            if (!response.ok) {
                if (response.status === 409) {
                    return {
                        success: false,
                        error: "CyberCat already claimed",
                    };
                }
                const errorData = await response.json().catch(() => ({}));
                console.error("📡 Error response:", errorData);
                return {
                    success: false,
                    error: errorData.message || `Error: ${response.status}`,
                };
            }

            const data = await response.json();
            console.log("✅ CyberCat claimed successfully:", data);

            return {
                success: true,
                cat: data.cat,
                contractAddress: data.contractAddress,
                chainId: data.chainId,
            };
        } catch (error) {
            console.error("❌ CyberCatService.claimCat error:", error);
            return {
                success: false,
                error: "Cannot connect to server",
            };
        }
    }

    /**
     * Get current CyberCat data (off-chain + on-chain balances)
     */
    static async getCat(): Promise<GetCatResponse> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: "Not logged in!" };
        }

        try {
            const response = await fetch(this.API_URL, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: "No CyberCat found — claim one first",
                    };
                }
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: errorData.message || `Error: ${response.status}`,
                };
            }

            const data = await response.json();
            return {
                success: true,
                cat: data.cat,
                onChain: data.onChain,
            };
        } catch (error) {
            console.error("❌ CyberCatService.getCat error:", error);
            return {
                success: false,
                error: "Cannot connect to server",
            };
        }
    }

    /**
     * Update CyberCat stats (name, mood, lastFedAt, stats)
     */
    static async updateCat(
        updates: UpdateCatRequest,
    ): Promise<UpdateCatResponse> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: "Not logged in!" };
        }

        try {
            console.log("🐱 Updating CyberCat:", updates);
            console.log("📡 Request:", {
                url: this.API_URL,
                method: "PATCH",
                body: updates,
                hasToken: !!token,
            });

            const response = await fetch(this.API_URL, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(updates),
            });

            console.log("📡 Response status:", response.status);

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: "No CyberCat found",
                    };
                }
                const errorData = await response.json().catch(() => ({}));
                console.error("📡 Error response:", errorData);
                return {
                    success: false,
                    error: errorData.message || `Error: ${response.status}`,
                };
            }

            const data = await response.json();
            console.log("✅ CyberCat updated successfully:", data);

            return {
                success: true,
                cat: data.cat,
            };
        } catch (error) {
            console.error("❌ CyberCatService.updateCat error:", error);
            return {
                success: false,
                error: "Cannot connect to server",
            };
        }
    }

    /**
     * Map pet type string to CatType number (1-7)
     */
    static petTypeToCatType(petType: string): CatType {
        const mapping: { [key: string]: CatType } = {
            "kungfu-master": 1,
            cowboy: 2,
            explorer: 3,
            bullfighter: 4,
            "soccer-player": 5,
            ninja: 6,
            nurse: 7,
        };
        return mapping[petType] || 1;
    }

    /**
     * Map CatType number to pet type string
     */
    static catTypeToPetType(catType: CatType): string {
        const mapping: { [key: number]: string } = {
            1: "kungfu-master",
            2: "cowboy",
            3: "explorer",
            4: "bullfighter",
            5: "soccer-player",
            6: "ninja",
            7: "nurse",
        };
        return mapping[catType] || "kungfu-master";
    }

    /**
     * Get FriendCard NFT balances from backend API
     * Returns on-chain balances for all 7 card types
     */
    static async getFriendCardBalances(): Promise<{
        success: boolean;
        address?: string;
        balances?: number[];
        cards?: Array<{ id: number; name: string; balance: number }>;
        error?: string;
    }> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: "Not logged in!" };
        }

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/friend-cards`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: errorData.message || `Error: ${response.status}`,
                };
            }

            const data = await response.json();
            return {
                success: true,
                address: data.address,
                balances: data.balances,
                cards: data.cards,
            };
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

