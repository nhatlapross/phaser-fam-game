/**
 * Shelby Storage Service - Client-side upload/list using Shelby SDK
 */

import { Account, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { ShelbyClient } from '@shelby-protocol/sdk/browser';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_APT_PRIVATE_KEY!;
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY!;

// 3 days in microseconds
const TIME_TO_LIVE = 3 * 24 * 60 * 60 * 1_000_000;

export interface ShelbyUploadResult {
    success: boolean;
    blobName?: string;
    blobUrl?: string;
    explorerUrl?: string;
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

// Lazy init client and signer
let client: ShelbyClient | null = null;
let signer: Account | null = null;

function getClient(): ShelbyClient {
    if (!client) {
        client = new ShelbyClient({
            network: Network.SHELBYNET,
            apiKey: API_KEY,
        });
    }
    return client;
}

function getSigner(): Account {
    if (!signer) {
        signer = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(PRIVATE_KEY),
        });
    }
    return signer;
}

/**
 * Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Upload image to Shelby storage (client-side)
 */
export async function uploadToShelby(
    imageBase64: string,
    username: string,
    filename: string
): Promise<ShelbyUploadResult> {
    try {
        const shelbyClient = getClient();
        const shelbyAccount = getSigner();
        
        // Convert base64 to Uint8Array
        const blobData = base64ToUint8Array(imageBase64);
        
        console.log(`Uploading blob: ${blobData.length} bytes`);

        // Blob name format: username/images/filename
        const blobName = `${username}/images/${filename}`;

        // Upload to Shelby
        await shelbyClient.upload({
            blobData,
            signer: shelbyAccount,
            blobName,
            expirationMicros: Date.now() * 1000 + TIME_TO_LIVE,
        });

        // Construct blob URL and explorer URL
        const blobUrl = `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${shelbyAccount.accountAddress.toString()}/${blobName}`;
        const explorerUrl = `https://explorer.shelby.xyz/shelbynet/account/${shelbyAccount.accountAddress.toString()}/blobs?name=${encodeURIComponent(blobName)}`;

        return {
            success: true,
            blobName,
            blobUrl,
            explorerUrl,
        };
    } catch (error: any) {
        console.error('Shelby upload error:', error);
        return {
            success: false,
            error: error.message || 'Failed to upload to Shelby',
        };
    }
}

/**
 * List images from Shelby storage (client-side)
 */
export async function listShelbyImages(username?: string): Promise<ShelbyListResult> {
    try {
        const shelbyClient = getClient();
        const shelbyAccount = getSigner();
        const accountAddress = shelbyAccount.accountAddress;

        // Get all blobs for this account
        const blobs = await shelbyClient.coordination.getAccountBlobs({ 
            account: accountAddress 
        });

        // Filter by username prefix if provided, and only images
        const filteredBlobs = blobs
            .filter((blob: any) => {
                if (username) {
                    return blob.name.includes(`${username}/images/`);
                }
                return blob.name.includes('/images/');
            })
            .map((blob: any) => {
                // blob.name may have @accountAddress/ prefix, remove it for URL
                let cleanName = blob.name;
                if (cleanName.startsWith('@')) {
                    const slashIndex = cleanName.indexOf('/');
                    if (slashIndex !== -1) {
                        cleanName = cleanName.substring(slashIndex + 1);
                    }
                }
                
                return {
                    name: blob.name,
                    size: blob.size,
                    expirationMicros: blob.expirationMicros,
                    url: `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${accountAddress.toString()}/${cleanName}`,
                };
            });

        return {
            success: true,
            blobs: filteredBlobs,
        };
    } catch (error: any) {
        console.error('Shelby list error:', error);
        return {
            success: false,
            error: error.message || 'Failed to list images from Shelby',
        };
    }
}

/**
 * Get blob URL from Shelby
 */
export function getShelbyBlobUrl(blobName: string): string {
    const shelbyAccount = getSigner();
    return `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${shelbyAccount.accountAddress.toString()}/${blobName}`;
}
