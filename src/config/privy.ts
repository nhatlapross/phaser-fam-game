import type { PrivyClientConfig } from '@privy-io/react-auth';
import { arbitrumSepolia, mainnet } from 'viem/chains';

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export const privyConfig: PrivyClientConfig = {
    loginMethods: ['google', 'email', 'wallet'],
    // Chain được hỗ trợ — bao gồm Arbitrum Sepolia (testnet) và Ethereum mainnet
    defaultChain: arbitrumSepolia,
    supportedChains: [arbitrumSepolia, mainnet],
    embeddedWallets: {
        ethereum: { createOnLogin: 'users-without-wallets' },
    },
    appearance: {
        theme: 'dark',
        accentColor: '#4ade80',
        logo: '/assets/logo.png',
    },
};
