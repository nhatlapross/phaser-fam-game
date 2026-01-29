/**
 * Gemini AI Service - Generate manga images using Google Gemini API
 * Tham khảo từ infinite-heroes project
 */

import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
// Model tương tự infinite-heroes
const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview';



export type MangaStyle = 'shounen' | 'shoujo' | 'chibi' | 'seinen' | 'classic';

export interface MangaStyleInfo {
    id: MangaStyle;
    name: string;
    description: string;
    emoji: string;
}

export const MANGA_STYLES: MangaStyleInfo[] = [
    { id: 'shounen', name: 'Shounen', description: 'Action-packed, dynamic poses', emoji: '⚔️' },
    { id: 'shoujo', name: 'Shoujo', description: 'Romantic, sparkly effects', emoji: '✨' },
    { id: 'chibi', name: 'Chibi', description: 'Cute, small characters', emoji: '🎀' },
    { id: 'seinen', name: 'Seinen', description: 'Mature, detailed art', emoji: '🌙' },
    { id: 'classic', name: 'Classic', description: 'Traditional manga style', emoji: '📖' },
];

export interface MangaGenerationRequest {
    characterImage?: string; // Base64 image
    characterDescription: string;
    storyContext: string;
    style: MangaStyle;
    previousPages?: string[]; // For continuation
}

export interface MangaPage {
    id: string;
    imageBase64: string;
    prompt: string;
    timestamp: number;
}

export interface MangaStory {
    id: string;
    title: string;
    style: MangaStyle;
    pages: MangaPage[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Build prompt for manga generation
 */
function buildMangaPrompt(request: MangaGenerationRequest, isFirstPage: boolean): string {
    const styleDescriptions: Record<MangaStyle, string> = {
        shounen: 'dynamic action shounen manga style with bold lines, speed effects, and dramatic angles',
        shoujo: 'beautiful shoujo manga style with soft lines, flower effects, sparkles, and romantic atmosphere',
        chibi: 'cute chibi manga style with small adorable characters, big eyes, and playful expressions',
        seinen: 'detailed seinen manga style with realistic proportions, mature themes, and intricate backgrounds',
        classic: 'classic black and white manga style with traditional panel layouts and screentones',
    };

    const styleDesc = styleDescriptions[request.style];
    
    let prompt = `STYLE: ${styleDesc} comic art, detailed ink. `;
    prompt += `TYPE: Vertical manga panel. `;
    
    if (request.characterDescription) {
        prompt += `MAIN CHARACTER: ${request.characterDescription}. `;
    }
    
    prompt += `SCENE: ${request.storyContext}. `;
    
    if (isFirstPage) {
        prompt += 'This is the first page - introduce the character and setting dramatically. ';
    } else {
        prompt += 'Continue the story from the previous page. ';
    }
    
    prompt += 'Include speech bubbles with dialogue in English. Use dramatic panel layouts.';
    
    return prompt;
}

/**
 * Get AI instance
 */
function getAI() {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

/**
 * Convert base64 data URL to raw base64
 */
function extractBase64(dataUrl: string): string {
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate manga page using Gemini API (multimodal) - tương tự infinite-heroes
 */
export async function generateMangaPage(request: MangaGenerationRequest, maxRetries = 3): Promise<string> {
    const ai = getAI();
    const isFirstPage = !request.previousPages || request.previousPages.length === 0;
    const promptText = buildMangaPrompt(request, isFirstPage);

    // Build multimodal contents array - giống infinite-heroes
    const contents: any[] = [];

    // Add character reference image if provided (như REFERENCE 1 [HERO] trong infinite-heroes)
    if (request.characterImage) {
        contents.push({ text: "REFERENCE [MAIN CHARACTER]:" });
        contents.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: extractBase64(request.characterImage)
            }
        });
    }

    // Add prompt text cuối cùng
    let finalPrompt = promptText;
    if (request.characterImage) {
        finalPrompt = `INSTRUCTIONS: Maintain strict character likeness using the REFERENCE image above. ${promptText}`;
    }
    contents.push({ text: finalPrompt });

    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Config đơn giản như infinite-heroes - chỉ dùng imageConfig
            const res = await ai.models.generateContent({
                model: MODEL_IMAGE_GEN,
                contents: contents,
                config: {
                    imageConfig: { 
                        aspectRatio: '2:3' // Vertical manga format
                    }
                }
            });

            // Extract image from response - giống infinite-heroes
            const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (part?.inlineData?.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }

            throw new Error('No image generated in response');
        } catch (error: any) {
            lastError = error;
            const msg = String(error);
            console.error(`Gemini API error (attempt ${attempt}/${maxRetries}):`, error);
            
            // Handle rate limit
            if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)/i);
                const waitTime = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1000 : 35000;
                
                if (attempt < maxRetries) {
                    console.log(`Rate limited. Waiting ${waitTime/1000}s before retry...`);
                    await sleep(waitTime);
                    continue;
                }
                throw new Error(`API quota exceeded. Please wait ${Math.ceil(waitTime/1000)} seconds and try again.`);
            }
            
            // Non-retryable errors
            if (msg.includes('API_KEY_INVALID') || msg.includes('permission denied')) {
                throw new Error('Invalid API key. Please check your Gemini API key.');
            }
            if (msg.includes('not found') || msg.includes('404')) {
                throw new Error('Model not available. Please check model name.');
            }
            
            throw error;
        }
    }
    
    throw lastError;
}

/**
 * Generate character persona từ description - tương tự generatePersona trong infinite-heroes
 */
export async function generateCharacterImage(description: string, style: MangaStyle = 'shounen'): Promise<string> {
    const ai = getAI();
    const styleDescriptions: Record<MangaStyle, string> = {
        shounen: 'dynamic action shounen manga',
        shoujo: 'beautiful shoujo manga with soft lines',
        chibi: 'cute chibi manga',
        seinen: 'detailed seinen manga',
        classic: 'classic black and white manga',
    };

    const prompt = `STYLE: Masterpiece ${styleDescriptions[style]} character sheet, detailed ink, neutral background. FULL BODY. Character: ${description}`;

    try {
        const res = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: { text: prompt },
            config: {
                imageConfig: { aspectRatio: '1:1' }
            }
        });

        const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (part?.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            return `data:${mimeType};base64,${part.inlineData.data}`;
        }
        throw new Error('Failed to generate character image');
    } catch (error) {
        console.error('Character generation failed:', error);
        throw error;
    }
}

// Local storage helpers
const STORAGE_KEY = 'manga_stories';

export function saveStory(story: MangaStory): void {
    const stories = getStories();
    const existingIndex = stories.findIndex(s => s.id === story.id);
    
    if (existingIndex >= 0) {
        stories[existingIndex] = story;
    } else {
        stories.push(story);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
}

export function getStories(): MangaStory[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export function getStory(id: string): MangaStory | null {
    const stories = getStories();
    return stories.find(s => s.id === id) || null;
}

export function deleteStory(id: string): void {
    const stories = getStories().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
}
