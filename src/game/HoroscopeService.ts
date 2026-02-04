import { UserService } from './UserService';

export interface HoroscopeResponse {
    content: string;
    remainingGold: number;
}

export interface HoroscopeRequest {
    day: number;
    month: number;
    year: number;
    hour: number;
    topic: string;
}

export class HoroscopeService {
    private static API_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/horoscope`;

    static async consult(data: HoroscopeRequest): Promise<HoroscopeResponse> {
        const token = UserService.getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(`${this.API_URL}/consult`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to consult horoscope');
        }

        return response.json();
    }
}
