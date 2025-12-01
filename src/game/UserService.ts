// src/game/UserService.ts

interface UserData {
    address: string; // The wallet address, internally represented as 'address'
    username: string;
    // Add other user-related data as needed
}

export class UserService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"; // New backend base URL, fallback for development

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
                const data = await response.json();
                // Assuming backend returns user data with 'walletAddress' and 'username'
                return {
                    address: data.walletAddress,
                    username: data.username,
                    network: "sui",
                    avatar: "https://avatar.iran.liara.run/public",
                } as UserData;
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
                        network: "sui",
                        avatar: "https://avatar.iran.liara.run/public",
                    }),
                }
            );

            if (response.ok) {
                const data = await response.json();
                // Assuming backend returns newly created user data with 'walletAddress' and 'username'
                return {
                    address: data.walletAddress,
                    username: data.username,
                } as UserData;
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
}

