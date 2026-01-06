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

// Mock missions for testing - set to true to use mock data
const USE_MOCK_MISSIONS = true;

const MOCK_MISSIONS: Mission[] = [
    {
        id: "mission-social-twitter-001",
        type: "social",
        name: "Share on Twitter",
        description: "Share a screenshot of your farm on Twitter with hashtag #FarmGame and submit the link or image as proof.",
        progress: 0,
        target: 1,
        status: "active",
        reward: {
            xp: 50,
            reputation: 10,
            items: [
                { type: "gold", amount: 100 },
                { type: "gem", amount: 5 }
            ]
        },
        resetPeriod: "weekly",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z"
    },
    {
        id: "mission-social-discord-001",
        type: "social",
        name: "Join Discord",
        description: "Join our Discord server and post your introduction in #welcome channel. Submit screenshot as proof.",
        progress: 0,
        target: 1,
        status: "active",
        reward: {
            xp: 30,
            reputation: 5,
            items: [{ type: "gold", amount: 50 }]
        },
        resetPeriod: "once",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z"
    },
    {
        id: "mission-daily-water-001",
        type: "farming",
        name: "Daily Watering",
        description: "Water 5 plants today",
        progress: 2,
        target: 5,
        status: "active",
        reward: {
            xp: 20,
            items: [{ type: "gold", amount: 30 }]
        },
        resetPeriod: "daily",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z"
    },
    {
        id: "mission-social-completed-001",
        type: "social",
        name: "Follow on Twitter",
        description: "Follow @FarmGame on Twitter",
        progress: 1,
        target: 1,
        status: "completed",
        reward: {
            xp: 25,
            items: [{ type: "gem", amount: 3 }]
        },
        resetPeriod: "once",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z"
    },
    {
        id: "mission-claimed-001",
        type: "farming",
        name: "First Harvest",
        description: "Harvest your first plant",
        progress: 1,
        target: 1,
        status: "claimed",
        reward: {
            xp: 10,
            items: [{ type: "gold", amount: 20 }]
        },
        resetPeriod: "once",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z"
    }
];

export class MissionService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Get all missions for the current user
     * @returns Array of missions or null on failure
     */
    static async getMissions(): Promise<Mission[] | null> {
        // Return mock data if enabled
        if (USE_MOCK_MISSIONS) {
            console.log('[MissionService] Using mock missions');
            return [...MOCK_MISSIONS];
        }

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
        // Mock update if enabled
        if (USE_MOCK_MISSIONS) {
            console.log('[MissionService] Mock updating mission:', missionId, 'progress:', progress);
            const mission = MOCK_MISSIONS.find(m => m.id === missionId);
            if (mission) {
                mission.progress = progress;
                if (mission.progress >= mission.target) {
                    mission.status = 'completed';
                }
                return { ...mission };
            }
            return null;
        }

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
        // Mock claim if enabled
        if (USE_MOCK_MISSIONS) {
            console.log('[MissionService] Mock claiming mission:', missionId);
            const mission = MOCK_MISSIONS.find(m => m.id === missionId);
            if (mission && mission.status === 'completed') {
                mission.status = 'claimed';
                return { ...mission };
            }
            return null;
        }

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
        // Mock submit if enabled
        if (USE_MOCK_MISSIONS) {
            console.log('[MissionService] Mock submitting proof:', missionId, proof);
            const mission = MOCK_MISSIONS.find(m => m.id === missionId);
            if (mission && mission.status === 'active') {
                mission.progress = mission.target;
                mission.status = 'completed';
                return { ...mission };
            }
            return null;
        }

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
