'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type Config } from 'wagmi';
import { wagmiAdapter, projectId, networks } from '@/config/wagmi';
import { createAppKit } from '@reown/appkit/react';
import { mainnet } from '@reown/appkit/networks';

const queryClient = new QueryClient();

// Set up metadata
const metadata = {
    name: 'Farming Game',
    description: 'A Phaser 3 Farming Game with Web3 Integration',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost:8080',
    icons: ['/assets/logo.png']
};

// Create the modal - this runs once when the module loads
if (typeof window !== 'undefined') {
    createAppKit({
        adapters: [wagmiAdapter],
        projectId,
        networks: [mainnet, ...networks.filter(n => n.id !== mainnet.id)] as [typeof mainnet, ...typeof networks],
        defaultNetwork: mainnet,
        metadata,
        features: {
            email: false,
            socials: ['google'],
            emailShowWallets: false,
        },
        allWallets: 'HIDE',
        featuredWalletIds: [
            'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        ],
        includeWalletIds: [
            'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        ],
        themeMode: 'dark',
    });
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}
