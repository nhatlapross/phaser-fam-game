import { cookieStorage, createStorage } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, polygon, optimism, arbitrum } from '@reown/appkit/networks';

// Get projectId from environment
export const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '';

if (!projectId) {
}

// Define networks
export const networks = [mainnet, polygon, optimism, arbitrum];

// Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: cookieStorage
    }),
    ssr: true,
    projectId,
    networks
});

export const config = wagmiAdapter.wagmiConfig;
