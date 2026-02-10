import { UserService } from './UserService';

export interface DefiMasterRequest {
    question: string;
    topic?: 'stablecoin' | 'yield' | 'portfolio' | 'looping' | 'perp' | 'general';
}

export interface DefiMasterResponse {
    success: boolean;
    content?: string;
    remainingGold?: number;
    error?: string;
}

export const DEFI_TOPICS = [
    { id: 'general', name: 'Tổng quát', emoji: '📚' },
    { id: 'stablecoin', name: 'Stablecoins', emoji: '💵' },
    { id: 'yield', name: 'Yield Farming', emoji: '🌾' },
    { id: 'portfolio', name: 'Portfolio', emoji: '📊' },
    { id: 'looping', name: 'Looping', emoji: '🔄' },
    { id: 'perp', name: 'Perp DEX', emoji: '�' },
];

export class DefiMasterService {
    private static API_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/defi-master`;

    static async askQuestion(request: DefiMasterRequest): Promise<DefiMasterResponse> {
        const token = UserService.getAccessToken();
        if (!token) {
            return { success: false, error: 'Chưa đăng nhập!' };
        }

        try {
            const response = await fetch(`${this.API_URL}/ask`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    question: request.question,
                    topic: request.topic || 'general'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return { 
                    success: false, 
                    error: errorData.message || `Lỗi: ${response.status}` 
                };
            }

            const data = await response.json();
            return {
                success: true,
                content: data.content,
                remainingGold: data.remainingGold
            };
        } catch (error) {
            console.error('DefiMaster API error:', error);
            return { 
                success: false, 
                error: 'Không thể kết nối đến server' 
            };
        }
    }
}
