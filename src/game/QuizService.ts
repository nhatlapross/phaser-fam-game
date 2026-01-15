// src/game/QuizService.ts

export interface QuizEvent {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

export interface Quiz {
    id: string;
    title: string;
    description: string;
    timePerQuestion: number;
    rewardXp: number;
    rewardGold: number;
    isActive: boolean;
    event: QuizEvent;
    questionCount: number;
    attemptCount: number;
    createdAt: string;
}

export interface QuizQuestion {
    id: string;
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    orderIndex: number;
}

export interface QuizDetail {
    id: string;
    title: string;
    description: string;
    timePerQuestion: number;
    rewardXp: number;
    rewardGold: number;
    questions: QuizQuestion[];
    event: QuizEvent;
}

export interface QuizDetailResponse {
    quiz: QuizDetail;
    hasAttempted: boolean;
    attempt: unknown | null;
}

export interface StartQuizResponse {
    success: boolean;
    attemptId?: string;
    quiz?: {
        id: string;
        title: string;
        timePerQuestion: number;
        totalQuestions: number;
    };
    message?: string;
    error?: string;
}

export interface QuizAnswer {
    questionId: string;
    answer: string; // "A", "B", "C", "D"
}

export interface AnswerResult {
    questionId: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
}

export interface SubmitQuizResponse {
    success: boolean;
    result: {
        score: number;
        correctAnswers: number;
        totalQuestions: number;
        xpEarned: number;
        goldEarned: number;
        isPerfect: boolean;
    };
    answers: AnswerResult[];
    message: string;
}

export interface QuizListResponse {
    quizzes: Quiz[];
}

export class QuizService {
    private static API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

    private static getAccessToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('fam_game_access_token');
    }

    /**
     * Get all available quizzes
     */
    static async getAllQuizzes(): Promise<Quiz[]> {
        const token = QuizService.getAccessToken();
        if (!token) {
            return [];
        }

        try {
            const response = await fetch(
                `${QuizService.API_BASE_URL}/quiz/admin/all`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: QuizListResponse = await response.json();
                return data.quizzes || [];
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
    }

    /**
     * Get only active quizzes
     */
    static async getActiveQuizzes(): Promise<Quiz[]> {
        const quizzes = await QuizService.getAllQuizzes();
        return quizzes.filter(q => q.isActive);
    }

    /**
     * Get quiz details with questions for an event
     */
    static async getQuizByEvent(eventId: string): Promise<QuizDetailResponse | null> {
        const token = QuizService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${QuizService.API_BASE_URL}/quiz/event/${eventId}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data: QuizDetailResponse = await response.json();
                return data;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    /**
     * Start a quiz attempt
     */
    static async startQuiz(quizId: string): Promise<StartQuizResponse> {
        const token = QuizService.getAccessToken();
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await fetch(
                `${QuizService.API_BASE_URL}/quiz/${quizId}/start`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                }
            );

            const data = await response.json().catch(() => ({}));
            
            if (response.ok) {
                return data;
            } else {
                return { 
                    success: false, 
                    error: data.message || data.error || 'Failed to start quiz' 
                };
            }
        } catch (error) {
            return { success: false, error: 'Network error. Please try again.' };
        }
    }

    /**
     * Submit quiz answers
     */
    static async submitQuiz(quizId: string, answers: QuizAnswer[]): Promise<SubmitQuizResponse | null> {
        const token = QuizService.getAccessToken();
        if (!token) {
            return null;
        }

        try {
            const response = await fetch(
                `${QuizService.API_BASE_URL}/quiz/${quizId}/submit`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ answers })
                }
            );

            if (response.ok) {
                const data: SubmitQuizResponse = await response.json();
                return data;
            } else {
                const errorData = await response.json().catch(() => ({}));
                return null;
            }
        } catch (error) {
            return null;
        }
    }
}
