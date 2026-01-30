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
 * Convert base64 to Blob
 */
function base64ToBlob(base64: string): Blob {
    const parts = base64.split(';base64,');
    const mimeType = parts[0].split(':')[1] || 'image/png';
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([uint8Array], { type: mimeType });
}

/**
 * Upload image to Shelby storage using FormData (binary upload)
 */
export async function uploadToShelby(
    imageBase64: string,
    username: string,
    filename: string
): Promise<ShelbyUploadResult> {
    try {
        // Convert base64 to Blob for binary upload
        const blob = base64ToBlob(imageBase64);
        
        // Use FormData for binary upload
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('username', username);
        formData.append('filename', filename);

        const response = await fetch('/api/shelby/upload', {
            method: 'POST',
            body: formData,
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
