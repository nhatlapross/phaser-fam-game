/**
 * Shelby Storage Service - Upload images to Shelby Protocol
 */

export interface ShelbyUploadResult {
    success: boolean;
    blobName?: string;
    blobUrl?: string;
    error?: string;
}

export interface ShelbyBlob {
    name: string;
    size: number;
    expirationMicros: number;
    url: string;
}

export interface ShelbyListResult {
    success: boolean;
    blobs?: ShelbyBlob[];
    error?: string;
}

/**
 * Upload image to Shelby storage
 */
export async function uploadToShelby(
    imageBase64: string,
    username: string,
    filename: string
): Promise<ShelbyUploadResult> {
    try {
        const response = await fetch('/api/shelby/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                imageBase64,
                username,
                filename,
            }),
        });

        const result = await response.json();
        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to upload to Shelby',
        };
    }
}

/**
 * List images from Shelby storage
 */
export async function listShelbyImages(username?: string): Promise<ShelbyListResult> {
    try {
        const url = username 
            ? `/api/shelby/list?username=${encodeURIComponent(username)}`
            : '/api/shelby/list';
            
        const response = await fetch(url);
        const result = await response.json();
        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to list images from Shelby',
        };
    }
}

/**
 * Get blob URL from Shelby
 */
export function getShelbyBlobUrl(accountAddress: string, blobName: string): string {
    return `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${accountAddress}/${blobName}`;
}
