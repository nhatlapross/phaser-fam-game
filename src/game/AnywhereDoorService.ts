/**
 * AnywhereDoorService - Cross-chain bridge service
 * Tích hợp API Anywhere Door để chuyển token giữa các blockchain
 */

export interface BridgeRequest {
    sourceChain: string; // Chain ID nguồn (vd: "421614" - Arbitrum Sepolia)
    destChain: string; // Chain ID đích (vd: "84532" - Base Sepolia)
    token: string; // Token address (0xEee...EEeE cho native token)
    amount: string; // Số lượng token (wei)
    userAddress: string; // Địa chỉ ví người dùng
}

export interface BridgeStatus {
    status: string;
    sourceChain: string;
    destChain: string;
    token: string;
    amount: string;
    timestamp: number;
    txHash?: string;
}

export class AnywhereDoorService {
    private static instance: AnywhereDoorService;
    private readonly API_BASE_URL = "http://localhost:3000"; // Anywhere Door API

    // Optional: Set a valid API token here for testing, or leave empty to use user's login token
    private readonly API_TOKEN =
        process.env.NEXT_PUBLIC_ANYWHERE_DOOR_TOKEN || "";

    private constructor() {}

    static getInstance(): AnywhereDoorService {
        if (!AnywhereDoorService.instance) {
            AnywhereDoorService.instance = new AnywhereDoorService();
        }
        return AnywhereDoorService.instance;
    }

    /**
     * Get Anywhere Door token from backend
     * Call this first to get a valid token for bridge operations
     */
    async getAnywhereDoorToken(): Promise<string | null> {
        try {
            // Get user's login token
            const { UserService } = await import("./UserService");
            const userToken = UserService.getAccessToken();

            if (!userToken) {
                console.error("❌ No user token - please log in first");
                return null;
            }

            const response = await fetch(
                `${this.API_BASE_URL}/anywhere-door/token`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${userToken}`,
                    },
                },
            );

            if (!response.ok) {
                console.error(
                    "❌ Failed to get Anywhere Door token:",
                    response.statusText,
                );
                return null;
            }

            const data = await response.json();
            console.log("✅ Got Anywhere Door token");
            return data.token || data.accessToken || null;
        } catch (error) {
            console.error("❌ Error getting Anywhere Door token:", error);
            return null;
        }
    }

    /**
     * Trigger cross-chain bridge
     * POST /anywhere-door/bridge
     */
    async triggerBridge(
        request: BridgeRequest,
    ): Promise<{ success: boolean; message: string; data?: any }> {
        try {
            console.log("🌉 Triggering cross-chain bridge:", request);

            // Try to get Anywhere Door token first
            let authToken = this.API_TOKEN;

            if (!authToken) {
                console.log(
                    "🔑 Attempting to get Anywhere Door token from backend...",
                );
                authToken = await this.getAnywhereDoorToken();
            }

            // Fallback to user's login token
            if (!authToken) {
                const { UserService } = await import("./UserService");
                authToken = UserService.getAccessToken();
            }

            console.log("🔑 Auth token available:", !!authToken);
            if (authToken) {
                console.log(
                    "🔑 Token preview:",
                    authToken.substring(0, 30) + "...",
                );
            }

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            // Add authorization header if token exists
            if (authToken) {
                headers["Authorization"] = `Bearer ${authToken}`;
            } else {
                console.warn("⚠️ No auth token found - request will fail");
                return {
                    success: false,
                    message: "Please log in first to use Anywhere Door",
                };
            }

            const response = await fetch(
                `${this.API_BASE_URL}/anywhere-door/bridge`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(request),
                },
            );

            if (!response.ok) {
                // Try to get error message from response body
                let errorMessage = response.statusText;
                try {
                    const errorData = await response.json();
                    errorMessage =
                        errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    // If response is not JSON, use statusText
                }

                throw new Error(`Bridge request failed: ${errorMessage}`);
            }

            const data = await response.json();
            console.log("✅ Bridge triggered successfully:", data);

            return {
                success: true,
                message: "Bridge transaction initiated",
                data,
            };
        } catch (error) {
            console.error("❌ Bridge error:", error);

            // If API is not available, show helpful error message
            if (error instanceof TypeError && error.message.includes("fetch")) {
                return {
                    success: false,
                    message:
                        "Cannot connect to bridge API. Please ensure the server is running at " +
                        this.API_BASE_URL,
                };
            }

            return {
                success: false,
                message:
                    error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Get latest bridge status for a user
     * GET /anywhere-door/status/{address}
     */
    async getBridgeStatus(userAddress: string): Promise<BridgeStatus | null> {
        try {
            console.log("📊 Fetching bridge status for:", userAddress);

            // Get auth token from UserService or use configured API token
            const { UserService } = await import("./UserService");
            const userToken = UserService.getAccessToken();
            const authToken = this.API_TOKEN || userToken;

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            // Add authorization header if token exists and is not SKIP_AUTH
            if (authToken && authToken !== "SKIP_AUTH") {
                headers["Authorization"] = `Bearer ${authToken}`;
            }

            const response = await fetch(
                `${this.API_BASE_URL}/anywhere-door/status/${userAddress}`,
                {
                    method: "GET",
                    headers,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Status request failed: ${response.statusText}`,
                );
            }

            const data = await response.json();
            console.log("✅ Bridge status:", data);

            return data as BridgeStatus;
        } catch (error) {
            console.error("❌ Status fetch error:", error);
            return null;
        }
    }

    /**
     * Helper: Convert ETH amount to wei
     */
    ethToWei(ethAmount: string): string {
        const wei = BigInt(Math.floor(parseFloat(ethAmount) * 1e18));
        return wei.toString();
    }

    /**
     * Helper: Convert wei to ETH
     */
    weiToEth(weiAmount: string): string {
        const eth = Number(BigInt(weiAmount)) / 1e18;
        return eth.toFixed(6);
    }

    /**
     * Helper: Get chain name from chain ID
     */
    getChainName(chainId: string): string {
        const chains: { [key: string]: string } = {
            "421614": "Arbitrum Sepolia",
            "84532": "Base Sepolia",
            "11155111": "Ethereum Sepolia",
            "80002": "Polygon Amoy",
            "1": "Ethereum Mainnet",
            "42161": "Arbitrum One",
            "8453": "Base",
            "137": "Polygon",
        };
        return chains[chainId] || `Chain ${chainId}`;
    }

    /**
     * Helper: Native token address constant
     */
    get NATIVE_TOKEN_ADDRESS(): string {
        return "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    }
}

