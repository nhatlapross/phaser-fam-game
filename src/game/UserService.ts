// src/game/UserService.ts

interface UserData {
    id: string;
    address: string; // The wallet address (EVM), internally represented as 'address'
    walletAddress?: string; // Alternative field name from API
    walletAddressSui?: string; // Sui wallet address
    walletAddressAptos?: string; // Aptos wallet address
    walletAddressCardano?: string; // Cardano wallet address
    username: string | null;
    avatar: string | null;
    characterType: number; // 1-5, maps to character index 0-4
    xp: number;
    reputationScore: number;
    gold?: number;
    gem?: number;
    landsCount: number;
    plantsCount: number;
    network: string;
    balanceGold?: number;
    balanceGem?: number;
}

interface LoginResponse {
    accessToken: string;
    user: {
        id: string;
        walletAddress: string;
        walletAddressSui?: string;
        walletAddressAptos?: string;
        walletAddressCardano?: string;
        network: string;
        username: string | null;
        avatar: string | null;
        characterType: number;
        xp: number;
        reputationScore: number;
        gold?: number;
        gem?: number;
        landsCount: number;
        plantsCount: number;
    };
    isNewUser?: boolean;
}

const STORAGE_KEY_TOKEN = 'fam_game_access_token';
const STORAGE_KEY_USER = 'fam_game_user_data';

export class UserService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"; // New backend base URL, fallback for development

    /**
     * Gets the stored access token
     */
    static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(STORAGE_KEY_TOKEN);
    }

    /**
     * Gets the stored user data
     */
    static getStoredUser(): UserData | null {
        if (typeof window === 'undefined') return null;
        const data = localStorage.getItem(STORAGE_KEY_USER);
        if (data) {
            try {
                return JSON.parse(data);
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Saves access token and user data to localStorage
     */
    private static saveAuthData(token: string, user: UserData): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }

    /**
     * Clears auth data from localStorage
     */
    static clearAuthData(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_USER);
        // Also clear badges data
        localStorage.removeItem('fam_game_user_badges');
        // Clear new user flag
        localStorage.removeItem('fam_game_is_new_user');
    }

    /**
     * Checks if a user with the given wallet address exists.
     * This now calls the /auth/login endpoint.
     * @param walletAddress The wallet address to check.
     * @returns A Promise that resolves to UserData if the user exists, otherwise null.
     */
    static async checkUser(walletAddress: string): Promise<UserData | null> {
        try {
            const response = await fetch(
                `${UserService.API_BASE_URL}/auth/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ walletAddress }), // Use walletAddress as per backend
                }
            );

            if (response.ok) {
                const data: LoginResponse = await response.json();

                // Save access token and user data
                const userData: UserData = {
                    id: data.user.id,
                    address: data.user.walletAddress,
                    walletAddress: data.user.walletAddress,
                    walletAddressSui: data.user.walletAddressSui,
                    walletAddressAptos: data.user.walletAddressAptos,
                    walletAddressCardano: data.user.walletAddressCardano,
                    username: data.user.username,
                    avatar: data.user.avatar,
                    characterType: data.user.characterType || 1,
                    xp: data.user.xp,
                    reputationScore: data.user.reputationScore,
                    gold: data.user.gold,
                    gem: data.user.gem,
                    landsCount: data.user.landsCount,
                    plantsCount: data.user.plantsCount,
                    network: data.user.network,
                };

                UserService.saveAuthData(data.accessToken, userData);

                return userData;
            } else if (response.status === 404) {
                // User not found
                return null;
            } else {
                console.error(
                    "Error checking user:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error checking user:", error);
            return null;
        }
    }

    /**
     * Registers a new user.
     * @param walletAddress The wallet address of the user.
     * @param username The desired username.
     * @param characterType The selected character type (1-5).
     * @returns A Promise that resolves to UserData of the newly registered user, otherwise null.
     */
    static async registerUser(
        walletAddress: string,
        username: string,
        characterType: number = 1
    ): Promise<UserData | null> {
        try {
            const response = await fetch(
                `${UserService.API_BASE_URL}/auth/register`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        walletAddress,
                        username,
                        characterType,
                    }),
                }
            );

            if (response.ok) {
                const data: LoginResponse = await response.json();

                // Save access token and user data
                const userData: UserData = {
                    id: data.user.id,
                    address: data.user.walletAddress,
                    walletAddress: data.user.walletAddress,
                    walletAddressSui: data.user.walletAddressSui,
                    walletAddressAptos: data.user.walletAddressAptos,
                    walletAddressCardano: data.user.walletAddressCardano,
                    username: data.user.username,
                    avatar: data.user.avatar,
                    characterType: data.user.characterType || characterType,
                    xp: data.user.xp,
                    reputationScore: data.user.reputationScore,
                    gold: data.user.gold,
                    gem: data.user.gem,
                    landsCount: data.user.landsCount,
                    plantsCount: data.user.plantsCount,
                    network: data.user.network,
                };

                UserService.saveAuthData(data.accessToken, userData);

                return userData;
            } else {
                console.error(
                    "Error registering user:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error registering user:", error);
            return null;
        }
    }

    /**
     * Fetches the current user's full profile including balances
     * @returns User profile data or null on failure
     */
    static async getUserProfile(): Promise<UserData | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            console.log("No access token available for fetching profile");
            return null;
        }

        try {
            const response = await fetch(
                `${UserService.API_BASE_URL}/user/profile`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                console.log('[UserService] getUserProfile API response - XP:', data.xp, 'Rep:', data.reputationScore);

                // Get existing stored user to preserve wallet addresses and characterType
                const existingUser = UserService.getStoredUser();

                // For characterType: prefer existingUser (from register/login) over profile API
                // because profile API may return default value (1) even if user selected different character
                const characterType = existingUser?.characterType || data.characterType || 1;

                // Map API response to UserData, preserving wallet addresses from login
                const userData: UserData = {
                    id: data.id,
                    address: data.walletAddress,
                    walletAddress: data.walletAddress,
                    // Preserve wallet addresses from existing stored user (from login)
                    walletAddressSui: data.walletAddressSui || existingUser?.walletAddressSui,
                    walletAddressAptos: data.walletAddressAptos || existingUser?.walletAddressAptos,
                    walletAddressCardano: data.walletAddressCardano || existingUser?.walletAddressCardano,
                    username: data.username,
                    avatar: data.avatar,
                    characterType,
                    xp: data.xp,
                    reputationScore: data.reputationScore,
                    gold: data.gold,
                    gem: data.gem,
                    landsCount: data._count?.lands || 0,
                    plantsCount: data.lands?.filter((land: any) => land.plant).length || 0,
                    network: data.network,
                    balanceGold: data.balanceGold || data.gold || 0,
                    balanceGem: data.balanceGem || data.gem || 0,
                };

                // Update stored user data
                localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));

                return userData;
            } else {
                console.error(
                    "Error fetching user profile:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error fetching user profile:", error);
            return null;
        }
    }

    /**
     * Updates user profile
     * @param updates Object containing fields to update
     * @returns Updated user data or null on failure
     */
    static async updateUser(updates: { username?: string; avatar?: string; characterType?: number }): Promise<UserData | null> {
        const token = UserService.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        try {
            const response = await fetch(
                `${UserService.API_BASE_URL}/user/profile`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify(updates),
                }
            );

            if (response.ok) {
                const data = await response.json();

                // Update stored user data
                const currentUser = UserService.getStoredUser();
                if (currentUser) {
                    const updatedUser: UserData = {
                        ...currentUser,
                        username: data.username ?? currentUser.username,
                        avatar: data.avatar ?? currentUser.avatar,
                        characterType: data.characterType ?? currentUser.characterType,
                        xp: data.xp ?? currentUser.xp,
                        reputationScore: data.reputationScore ?? currentUser.reputationScore,
                        balanceGold: data.balanceGold ?? currentUser.balanceGold,
                        balanceGem: data.balanceGem ?? currentUser.balanceGem,
                    };
                    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
                    return updatedUser;
                }
                return null;
            } else {
                console.error(
                    "Error updating user:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error updating user:", error);
            return null;
        }
    }
}

