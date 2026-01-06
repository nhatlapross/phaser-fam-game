// src/game/MissionService.ts

export interface MissionReward {
    xp?: number;
    reputation?: number;
    items?: Array<{
        type: string;
        amount: number;
    }>;
}

export interface Mission {
    id: string;
    type: string;
    name: string;
    description: string;
    progress: number;
    target: number;
    status: 'active' | 'completed' | 'claimed';
    reward: MissionReward;
    resetPeriod: 'daily' | 'weekly' | 'monthly' | 'once';
    createdAt: string;
    updatedAt: string;
}

export class MissionService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Get all missions for the current user
     * @returns Array of missions or null on failure
     */
    static async getMissions(): Promise<Mission[] | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        try {
            const response = await fetch(
                `${MissionService.API_BASE_URL}/missions`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const missions: Mission[] = await response.json();
                return missions;
            } else {
                console.error(
                    "Error fetching missions:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error fetching missions:", error);
            return null;
        }
    }

    /**
     * Update mission progress
     * @param missionId The mission ID
     * @param progress The new progress value
     * @returns Updated mission or null on failure
     */
    static async updateMissionProgress(missionId: string, progress: number): Promise<Mission | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        try {
            const response = await fetch(
                `${MissionService.API_BASE_URL}/missions/${missionId}/progress`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ progress }),
                }
            );

            if (response.ok) {
                const mission: Mission = await response.json();
                return mission;
            } else {
                console.error(
                    "Error updating mission progress:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error updating mission progress:", error);
            return null;
        }
    }

    /**
     * Claim mission reward
     * @param missionId The mission ID
     * @returns Updated mission or null on failure
     */
    static async claimMissionReward(missionId: string): Promise<Mission | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        try {
            const response = await fetch(
                `${MissionService.API_BASE_URL}/missions/${missionId}/claim`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const mission: Mission = await response.json();
                return mission;
            } else {
                console.error(
                    "Error claiming mission reward:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error claiming mission reward:", error);
            return null;
        }
    }

    /**
     * Submit proof for a mission (link or image URL)
     * @param missionId The mission ID
     * @param proof The proof URL (social link or IPFS image URL)
     * @returns Updated mission or null on failure
     */
    static async submitProof(missionId: string, proof: string): Promise<Mission | null> {
        const token = this.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        try {
            const response = await fetch(
                `${MissionService.API_BASE_URL}/missions/${missionId}/proof`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ proof }),
                }
            );

            if (response.ok) {
                const mission: Mission = await response.json();
                return mission;
            } else {
                console.error(
                    "Error submitting mission proof:",
                    response.statusText,
                    await response.text()
                );
                return null;
            }
        } catch (error) {
            console.error("Network error submitting mission proof:", error);
            return null;
        }
    }

    /**
     * Gets the stored access token from UserService
     */
    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }
}
