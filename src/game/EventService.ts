// src/game/EventService.ts

export interface GameEvent {
    id: string;
    name: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
}

export class EventService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    /**
     * Gets the stored access token from localStorage
     */
    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Get all active events
     * @returns A Promise that resolves to the list of active events
     */
    static async getActiveEvents(): Promise<GameEvent[]> {
        const token = EventService.getAccessToken();
        if (!token) {
            console.log('No access token available for events');
            return [];
        }

        try {
            const response = await fetch(
                `${EventService.API_BASE_URL}/events/active`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                console.log('Active events loaded:', data.length);
                return data;
            } else {
                console.error('Error fetching active events:', response.statusText);
                return [];
            }
        } catch (error) {
            console.error('Network error fetching active events:', error);
            return [];
        }
    }
}
