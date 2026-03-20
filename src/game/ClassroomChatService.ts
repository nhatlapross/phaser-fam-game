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

export interface LessonSummary {
    title: string;
    slug: string;
    updatedAt?: string;
}

export interface LessonPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface LessonListResponse {
    success: boolean;
    lessons?: LessonSummary[];
    pagination?: LessonPagination;
    error?: string;
}

export interface TreeNode {
    name: string;
    type: 'file' | 'directory';
    size?: number;
    updatedAt?: string;
    children?: TreeNode[];
}

export interface ResearchTreeResponse {
    success: boolean;
    tree?: TreeNode[];
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
     * Send a message via SSE stream. Calls onHeartbeat while waiting, returns full response on completion.
     */
    public async sendMessageStream(
        message: string,
        agentId: 'teacher' | 'mentor',
        onHeartbeat?: () => void,
    ): Promise<ChatResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, agentId }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`Chat API error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let eventType = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.slice(7);
                    } else if (line.startsWith('data: ') && eventType) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (eventType === 'heartbeat') {
                                onHeartbeat?.();
                            } else if (eventType === 'done') {
                                return { success: true, response: data.text, agentId: data.agentId, runId: data.runId };
                            } else if (eventType === 'error') {
                                return { success: false, error: data.error };
                            }
                        } catch { /* skip malformed */ }
                        eventType = '';
                    }
                }
            }

            return { success: false, error: 'Stream ended unexpectedly' };
        } catch (error) {
            console.error('ClassroomChatService stream error:', error);
            return { success: false, error: 'Sorry, I cannot respond right now. Please try again later.' };
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

    /**
     * Fetch lessons list with pagination
     */
    public async getLessons(page: number = 1, limit: number = 10): Promise<LessonListResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/lessons?page=${page}&limit=${limit}`);

            if (!response.ok) {
                throw new Error(`Lessons API error: ${response.status}`);
            }

            return await response.json() as LessonListResponse;
        } catch (error) {
            console.error('ClassroomChatService lessons error:', error);
            return {
                success: false,
                error: 'Could not load lessons list.',
            };
        }
    }

    /**
     * Fetch a specific lesson by slug
     */
    public async getLessonBySlug(slug: string): Promise<LessonResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/lesson/${slug}`);

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

    /**
     * Fetch research file tree from the API
     */
    public async getResearchTree(): Promise<ResearchTreeResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/research/tree`);

            if (!response.ok) {
                throw new Error(`Research tree API error: ${response.status}`);
            }

            return await response.json() as ResearchTreeResponse;
        } catch (error) {
            console.error('ClassroomChatService research tree error:', error);
            return {
                success: false,
                error: 'Could not load file tree.',
            };
        }
    }

    /**
     * Fetch a specific research file by folder and slug
     * GET /api/research/:folder/:slug
     */
    public async getResearchFile(folder: string, slug: string): Promise<LessonResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/research/${encodeURIComponent(folder)}/${encodeURIComponent(slug)}`);

            if (!response.ok) {
                throw new Error(`Research file API error: ${response.status}`);
            }

            return await response.json() as LessonResponse;
        } catch (error) {
            console.error('ClassroomChatService research file error:', error);
            return {
                success: false,
                error: 'Could not load file. Please try again later.',
            };
        }
    }
}
