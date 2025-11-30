import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, optimism, arbitrum } from 'wagmi/chains';

export const config = getDefaultConfig({
    appName: 'Farming Game',
    projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'demo-project-id',
    chains: [mainnet, polygon, optimism, arbitrum],
    ssr: true,
});
