// src/game/UserService.ts

interface UserData {
    id: string;
    address: string; // The wallet address, internally represented as 'address'
    username: string | null;
    avatar: string | null;
    xp: number;
    reputationScore: number;
    landsCount: number;
    plantsCount: number;
    network: string;
}

interface LoginResponse {
    accessToken: string;
    user: {
        id: string;
        walletAddress: string;
        network: string;
        username: string | null;
        avatar: string | null;
        xp: number;
        reputationScore: number;
        landsCount: number;
        plantsCount: number;
    };
    isNewUser: boolean;
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
                    username: data.user.username,
                    avatar: data.user.avatar,
                    xp: data.user.xp,
                    reputationScore: data.user.reputationScore,
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
     * @returns A Promise that resolves to UserData of the newly registered user, otherwise null.
     */
    static async registerUser(
        walletAddress: string,
        username: string
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
                    }),
                }
            );

            if (response.ok) {
                const data: LoginResponse = await response.json();

                // Save access token and user data
                const userData: UserData = {
                    id: data.user.id,
                    address: data.user.walletAddress,
                    username: data.user.username,
                    avatar: data.user.avatar,
                    xp: data.user.xp,
                    reputationScore: data.user.reputationScore,
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
     * Updates user profile
     * @param updates Object containing fields to update
     * @returns Updated user data or null on failure
     */
    static async updateUser(updates: { username?: string; avatar?: string }): Promise<UserData | null> {
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
                        xp: data.xp ?? currentUser.xp,
                        reputationScore: data.reputationScore ?? currentUser.reputationScore,
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

