export interface PetChatRequest {
    message: string;
    petType: string;
    petName: string;
}

export interface PetChatResponse {
    success: boolean;
    content?: string;
    error?: string;
}

export class PetChatService {
    // Use the same AI agent API as ClassroomChatService
    private static API_URL =
        process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3001";

    static async sendMessage(
        request: PetChatRequest,
    ): Promise<PetChatResponse> {
        const apiUrl = `${this.API_URL}/api/chat`;

        // Use 'mentor' agent for pet chat (friendly, supportive personality)
        // Add pet context in the message itself
        const enhancedMessage = `[Pet: ${request.petName} (${request.petType})] ${request.message}`;

        const payload = {
            message: enhancedMessage,
            agentId: "mentor", // Use existing mentor agent
        };

        console.log("🐱 PetChatService: Calling API", {
            url: apiUrl,
            payload,
        });

        try {
            // Call AI agent API with mentor as agentId
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            console.log("🐱 PetChatService: Response status", response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("🐱 PetChatService: Error response", errorData);
                return {
                    success: false,
                    error: errorData.error || `Error: ${response.status}`,
                };
            }

            const data = await response.json();
            console.log("🐱 PetChatService: Success response", data);

            return {
                success: true,
                content: data.response || data.content,
            };
        } catch (error) {
            console.error("🐱 PetChatService: Network error", error);
            return {
                success: false,
                error: "Cannot connect to server",
            };
        }
    }
}

