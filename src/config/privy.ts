import type { PrivyClientConfig } from '@privy-io/react-auth';
import { arbitrumSepolia } from 'viem/chains';
import { defineChain } from 'viem';

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export const creditcoin = defineChain({
    id: 102031,
    name: 'Creditcoin',
    nativeCurrency: { name: 'Creditcoin', symbol: 'CTC', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] },
    },
    blockExplorers: {
        default: { name: 'Creditcoin Explorer', url: 'https://creditcoin-testnet.blockscout.com' },
    },
});

export const SUPPORTED_CHAINS = [
    { chain: arbitrumSepolia, id: arbitrumSepolia.id, name: 'Arbitrum Sepolia', shortName: 'ARB', color: 0x28A0F0 },
    { chain: creditcoin, id: creditcoin.id, name: 'Creditcoin', shortName: 'CTC', color: 0x4ade80 },
] as const;

export const privyConfig: PrivyClientConfig = {
    loginMethods: ['google', 'email', 'wallet'],
    defaultChain: arbitrumSepolia,
    supportedChains: [arbitrumSepolia, creditcoin],
    embeddedWallets: {
        ethereum: { createOnLogin: 'users-without-wallets' },
    },
    appearance: {
        theme: 'dark',
        accentColor: '#4ade80',
        logo: '/assets/logo.png',
    },
};
