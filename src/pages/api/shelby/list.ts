import type { NextApiRequest, NextApiResponse } from 'next';
import { Account, AccountAddress, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_APT_PRIVATE_KEY!;
const API_KEY = process.env.NEXT_PUBLIC_SHELBY_API_KEY!;

export interface ShelbyBlob {
    name: string;
    size: number;
    expirationMicros: number;
    url: string;
}

interface ListResponse {
    success: boolean;
    blobs?: ShelbyBlob[];
    error?: string;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ListResponse>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { username } = req.query;

        // Initialize Shelby client
        const client = new ShelbyNodeClient({
            network: Network.SHELBYNET,
            apiKey: API_KEY,
        });

        // Get account address from private key
        const signer = Account.fromPrivateKey({
            privateKey: new Ed25519PrivateKey(PRIVATE_KEY),
        });
        const accountAddress = signer.accountAddress;

        // Get all blobs for this account
        const blobs = await client.coordination.getAccountBlobs({ 
            account: accountAddress 
        });

        // Filter by username prefix if provided, and only images
        const filteredBlobs = blobs
            .filter(blob => {
                // Check if blob name contains username/images pattern
                if (username) {
                    return blob.name.includes(`${username}/images/`);
                }
                return blob.name.includes('/images/');
            })
            .map(blob => {
                // blob.name may have @accountAddress/ prefix, remove it for URL
                let cleanName = blob.name;
                if (cleanName.startsWith('@')) {
                    // Remove @accountAddress/ prefix
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

        return res.status(200).json({
            success: true,
            blobs: filteredBlobs,
        });

    } catch (error: any) {
        console.error('Shelby list error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to list blobs from Shelby',
        });
    }
}
