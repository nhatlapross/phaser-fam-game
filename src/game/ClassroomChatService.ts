/**
 * ClassroomChatService - Calls AI Agent API for Teacher/Mentor chat
 *
 * Endpoint: POST {NEXT_PUBLIC_AGENT_API_URL}/api/chat
 *
 * Request:  { message: string, agentId: 'teacher' | 'mentor' }
 * Response: { success: boolean, response: string (markdown), agentId: string, runId: string }
 * Error:    { success: false, error: string }
 */

export interface ChatResponse {
    success: boolean;
    response?: string;
    agentId?: string;
    runId?: string;
    error?: string;
}

export interface LessonResponse {
    success: boolean;
    title?: string;
    slug?: string;
    content?: string;
    toc?: string[];
    updatedAt?: string;
    error?: string;
}

export class ClassroomChatService {
    private static instance: ClassroomChatService | null = null;
    private readonly baseUrl = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://54.255.174.8:3001';

    private constructor() {}

    public static getInstance(): ClassroomChatService {
        if (!ClassroomChatService.instance) {
            ClassroomChatService.instance = new ClassroomChatService();
        }
        return ClassroomChatService.instance;
    }

    /**
     * Send a message to teacher or mentor agent
     */
    public async sendMessage(message: string, agentId: 'teacher' | 'mentor'): Promise<ChatResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, agentId }),
            });

            if (!response.ok) {
                throw new Error(`Chat API error: ${response.status}`);
            }

            return await response.json() as ChatResponse;
        } catch (error) {
            console.error('ClassroomChatService error:', error);
            return {
                success: false,
                error: 'Sorry, I cannot respond right now. Please try again later.',
            };
        }
    }

    /**
     * Fetch the latest lesson from the API
     */
    public async getLatestLesson(): Promise<LessonResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/lesson/latest`);

            if (!response.ok) {
                throw new Error(`Lesson API error: ${response.status}`);
            }

            return await response.json() as LessonResponse;
        } catch (error) {
            console.error('ClassroomChatService lesson error:', error);
            return {
                success: false,
                error: 'Could not load lesson. Please try again later.',
            };
        }
    }
}
