import type { NextApiRequest, NextApiResponse } from 'next';
import { Account, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_APT_PRIVATE_KEY!;
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY!;

// 3 days in microseconds
const TIME_TO_LIVE = 3 * 24 * 60 * 60 * 1_000_000;

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

interface UploadRequest {
    imageBase64: string;
    username: string;
    filename: string;
}

interface UploadResponse {
    success: boolean;
    blobName?: string;
    blobUrl?: string;
    error?: string;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<UploadResponse>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { imageBase64, username, filename } = req.body as UploadRequest;

        if (!imageBase64 || !username || !filename) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: imageBase64, username, filename' 
            });
        }

        // Convert base64 to Uint8Array
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const blobData = Buffer.from(base64Data, 'base64');

        // Initialize Shelby client
        const client = new ShelbyNodeClient({
            network: Network.SHELBYNET,
            apiKey: API_KEY,
        });

        // Create signer from private key
        const signer = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(PRIVATE_KEY),
        });

        // Blob name format: username/images/filename
        const blobName = `${username}/images/${filename}`;

        // Upload to Shelby
        await client.upload({
            blobData,
            signer,
            blobName,
            expirationMicros: Date.now() * 1000 + TIME_TO_LIVE,
        });

        // Construct blob URL
        const blobUrl = `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${signer.accountAddress.toString()}/${blobName}`;

        return res.status(200).json({
            success: true,
            blobName,
            blobUrl,
        });

    } catch (error: any) {
        console.error('Shelby upload error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload to Shelby',
        });
    }
}
