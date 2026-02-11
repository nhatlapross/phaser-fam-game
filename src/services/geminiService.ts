/**
 * Gemini AI Service - Generate comic/manhwa/manhua images using Google Gemini API
 */

import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview';

// Comic Format Types
export type ComicFormat = 'comic' | 'manhwa' | 'manhua';

// Genre/Style types for each format
export type ComicGenre = 'superhero' | 'horror' | 'sci-fi' | 'fantasy' | 'noir' | 'comedy';
export type ManhwaGenre = 'action' | 'romance' | 'fantasy' | 'murim' | 'regression' | 'slice-of-life';
export type ManhuaGenre = 'cultivation' | 'martial-arts' | 'romance' | 'fantasy' | 'historical' | 'comedy';

export type GenreType = ComicGenre | ManhwaGenre | ManhuaGenre;

// Format info
export interface ComicFormatInfo {
    id: ComicFormat;
    name: string;
    description: string;
    emoji: string;
    origin: string;
}

export const COMIC_FORMATS: ComicFormatInfo[] = [
    { id: 'comic', name: 'Comic Book', description: 'Western-style comics', emoji: '🦸', origin: 'Western' },
    { id: 'manhwa', name: 'Manhwa', description: 'Korean webtoon style', emoji: '🇰🇷', origin: 'Korean' },
    { id: 'manhua', name: 'Manhua', description: 'Chinese comic style', emoji: '🇨🇳', origin: 'Chinese' },
];

// Genre info
export interface GenreInfo {
    id: string;
    name: string;
    description: string;
    emoji: string;
}

export const COMIC_GENRES: GenreInfo[] = [
    { id: 'superhero', name: 'Superhero', description: 'Heroes with powers', emoji: '🦸' },
    { id: 'horror', name: 'Horror', description: 'Dark and scary', emoji: '👻' },
    { id: 'sci-fi', name: 'Sci-Fi', description: 'Futuristic technology', emoji: '🚀' },
    { id: 'fantasy', name: 'Fantasy', description: 'Magic and mythical', emoji: '🧙' },
    { id: 'noir', name: 'Noir', description: 'Crime and mystery', emoji: '🕵️' },
    { id: 'comedy', name: 'Comedy', description: 'Funny and lighthearted', emoji: '😂' },
];

export const MANHWA_GENRES: GenreInfo[] = [
    { id: 'action', name: 'Action', description: 'Fighting and adventure', emoji: '⚔️' },
    { id: 'romance', name: 'Romance', description: 'Love stories', emoji: '💕' },
    { id: 'fantasy', name: 'Fantasy', description: 'Magic worlds', emoji: '✨' },
    { id: 'murim', name: 'Murim', description: 'Martial arts world', emoji: '🥋' },
    { id: 'regression', name: 'Regression', description: 'Time travel/rebirth', emoji: '⏪' },
    { id: 'slice-of-life', name: 'Slice of Life', description: 'Daily life stories', emoji: '🌸' },
];

export const MANHUA_GENRES: GenreInfo[] = [
    { id: 'cultivation', name: 'Cultivation', description: 'Power leveling journey', emoji: '🧘' },
    { id: 'martial-arts', name: 'Martial Arts', description: 'Kung fu and fighting', emoji: '🥊' },
    { id: 'romance', name: 'Romance', description: 'Love and relationships', emoji: '💗' },
    { id: 'fantasy', name: 'Fantasy', description: 'Magical adventures', emoji: '🐉' },
    { id: 'historical', name: 'Historical', description: 'Ancient China setting', emoji: '🏯' },
    { id: 'comedy', name: 'Comedy', description: 'Humor and fun', emoji: '🤣' },
];

// Get genres by format
export function getGenresByFormat(format: ComicFormat): GenreInfo[] {
    switch (format) {
        case 'comic': return COMIC_GENRES;
        case 'manhwa': return MANHWA_GENRES;
        case 'manhua': return MANHUA_GENRES;
        default: return COMIC_GENRES;
    }
}

// Legacy support - map to new system
export type MangaStyle = ComicGenre | ManhwaGenre | ManhuaGenre;

export interface MangaStyleInfo {
    id: MangaStyle;
    name: string;
    description: string;
    emoji: string;
}

// Legacy MANGA_STYLES for backward compatibility
export const MANGA_STYLES: MangaStyleInfo[] = [
    { id: 'action', name: 'Action', description: 'Dynamic action scenes', emoji: '⚔️' },
    { id: 'romance', name: 'Romance', description: 'Love stories', emoji: '💕' },
    { id: 'fantasy', name: 'Fantasy', description: 'Magic and adventure', emoji: '✨' },
    { id: 'comedy', name: 'Comedy', description: 'Funny moments', emoji: '😂' },
    { id: 'horror', name: 'Horror', description: 'Dark and scary', emoji: '👻' },
];

export interface MangaGenerationRequest {
    characterImage?: string;
    characterDescription: string;
    storyContext: string;
    style: MangaStyle;
    format?: ComicFormat;
    previousPages?: string[];
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
    format?: ComicFormat;
    pages: MangaPage[];
    createdAt: number;
    updatedAt: number;
}

function buildPrompt(request: MangaGenerationRequest, isFirstPage: boolean): string {
    const format = request.format || 'manhwa';
    
    // Format-specific style descriptions
    const formatStyles: Record<ComicFormat, string> = {
        comic: 'Western comic book style with bold ink lines, halftone dots, dynamic panel layouts, vibrant colors, dramatic shadows',
        manhwa: 'Korean manhwa webtoon style with clean digital art, soft shading, vertical scroll format, expressive eyes, detailed backgrounds',
        manhua: 'Chinese manhua style with flowing ink brush strokes, elegant character designs, traditional Chinese aesthetics, dynamic action poses',
    };

    // Genre-specific descriptions
    const genreDescriptions: Record<string, string> = {
        // Comic genres
        superhero: 'superhero theme with powerful poses, capes, masks, city skylines, action effects',
        horror: 'horror atmosphere with dark shadows, creepy details, unsettling imagery, tension',
        'sci-fi': 'science fiction setting with futuristic technology, space elements, neon lights, cyberpunk vibes',
        fantasy: 'fantasy world with magic effects, mythical creatures, enchanted environments',
        noir: 'noir detective style with high contrast shadows, rain, urban settings, mysterious mood',
        // Manhwa genres
        action: 'intense action scenes with speed lines, impact effects, dynamic poses',
        romance: 'romantic atmosphere with soft lighting, flower effects, emotional expressions, sparkles',
        murim: 'martial arts world (murim) with traditional Korean elements, qi energy effects, sword techniques',
        regression: 'regression/rebirth theme with time elements, memory flashbacks, determined protagonist',
        'slice-of-life': 'slice of life with warm colors, everyday scenes, gentle expressions, cozy atmosphere',
        // Manhua genres
        cultivation: 'cultivation theme with qi/spiritual energy auras, meditation poses, breakthrough effects, heavenly tribulations',
        'martial-arts': 'martial arts with kung fu poses, chi energy, traditional Chinese weapons, fighting stances',
        historical: 'ancient Chinese historical setting with traditional architecture, period costumes, imperial aesthetics',
        comedy: 'comedic style with exaggerated expressions, chibi moments, funny reactions',
    };

    const formatStyle = formatStyles[format];
    const genreStyle = genreDescriptions[request.style] || genreDescriptions['action'];
    
    let prompt = `STYLE: ${formatStyle}. `;
    prompt += `GENRE: ${genreStyle}. `;
    prompt += `TYPE: ${format === 'manhwa' ? 'Vertical webtoon panel' : 'Comic panel layout'}. `;
    
    if (request.characterDescription) {
        prompt += `MAIN CHARACTER: ${request.characterDescription}. `;
    }
    
    prompt += `SCENE: ${request.storyContext}. `;
    
    if (isFirstPage) {
        prompt += 'This is the first page - introduce the character and setting dramatically. ';
    } else {
        prompt += 'Continue the story from the previous page. ';
    }
    
    prompt += 'Include speech bubbles with dialogue. Use dramatic panel layouts with clear storytelling.';
    
    return prompt;
}

function getAI() {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not configured');
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function extractBase64(dataUrl: string): string {
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateMangaPage(request: MangaGenerationRequest, maxRetries = 3): Promise<string> {
    const ai = getAI();
    const isFirstPage = !request.previousPages || request.previousPages.length === 0;
    const promptText = buildPrompt(request, isFirstPage);

    const contents: any[] = [];

    if (request.characterImage) {
        contents.push({ text: "REFERENCE [MAIN CHARACTER]:" });
        contents.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: extractBase64(request.characterImage)
            }
        });
    }

    let finalPrompt = promptText;
    if (request.characterImage) {
        finalPrompt = `INSTRUCTIONS: Maintain strict character likeness using the REFERENCE image above. ${promptText}`;
    }
    contents.push({ text: finalPrompt });

    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await ai.models.generateContent({
                model: MODEL_IMAGE_GEN,
                contents: contents,
                config: {
                    imageConfig: { aspectRatio: request.format === 'manhwa' ? '2:3' : '3:4' }
                }
            });

            const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (part?.inlineData?.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }

            throw new Error('No image generated in response');
        } catch (error: any) {
            lastError = error;
            const msg = String(error);
            
            if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)/i);
                const waitTime = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1000 : 35000;
                
                if (attempt < maxRetries) {
                    await sleep(waitTime);
                    continue;
                }
                throw new Error(`API quota exceeded. Please wait ${Math.ceil(waitTime/1000)} seconds and try again.`);
            }
            
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

export async function generateCharacterImage(description: string, format: ComicFormat = 'manhwa', genre: string = 'action'): Promise<string> {
    const ai = getAI();
    
    const formatStyles: Record<ComicFormat, string> = {
        comic: 'Western comic book character art',
        manhwa: 'Korean manhwa webtoon character art',
        manhua: 'Chinese manhua character art',
    };

    const prompt = `STYLE: Masterpiece ${formatStyles[format]}, detailed, neutral background. FULL BODY character sheet. Character: ${description}`;

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
}
