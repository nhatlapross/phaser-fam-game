import type { NextApiRequest, NextApiResponse } from 'next';
import { Account, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import formidable from 'formidable';
import fs from 'fs';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_APT_PRIVATE_KEY!;
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY!;

// 3 days in microseconds
const TIME_TO_LIVE = 3 * 24 * 60 * 60 * 1_000_000;
const MAX_RETRIES = 3;

// Disable default body parser for FormData
export const config = {
    api: {
        bodyParser: false,
    },
};

interface UploadResponse {
    success: boolean;
    blobName?: string;
    blobUrl?: string;
    error?: string;
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse FormData
async function parseForm(req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
    return new Promise((resolve, reject) => {
        const form = formidable({ maxFileSize: 10 * 1024 * 1024 }); // 10MB
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<UploadResponse>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { fields, files } = await parseForm(req);
        
        const username = Array.isArray(fields.username) ? fields.username[0] : fields.username;
        const filename = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename;
        const file = Array.isArray(files.file) ? files.file[0] : files.file;

        if (!file || !username || !filename) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: file, username, filename' 
            });
        }

        // Read file as buffer
        const blobData = fs.readFileSync(file.filepath);
        
        console.log(`Uploading blob: ${blobData.length} bytes`);

        // Cleanup temp file
        fs.unlinkSync(file.filepath);

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

        // Upload to Shelby with retry
        let lastError: any;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                await client.upload({
                    blobData,
                    signer,
                    blobName,
                    expirationMicros: Date.now() * 1000 + TIME_TO_LIVE,
                });
                
                // Success - construct blob URL and return
                const blobUrl = `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${signer.accountAddress.toString()}/${blobName}`;
                return res.status(200).json({
                    success: true,
                    blobName,
                    blobUrl,
                });
            } catch (error: any) {
                lastError = error;
                console.error(`Upload attempt ${attempt} failed:`, error.message);
                
                if (error.message?.includes('502') || 
                    error.message?.includes('503') || 
                    error.message?.includes('504')) {
                    if (attempt < MAX_RETRIES) {
                        console.log(`Retrying in ${2000 * attempt}ms...`);
                        await sleep(2000 * attempt);
                        continue;
                    }
                    throw new Error('Shelby server temporarily unavailable. Please try again later.');
                }
                throw error;
            }
        }
        
        throw lastError;

    } catch (error: any) {
        console.error('Shelby upload error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload to Shelby',
        });
    }
}
