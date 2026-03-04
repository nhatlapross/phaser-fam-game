'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { PRIVY_APP_ID, privyConfig, SUPPORTED_CHAINS } from '@/config/privy';

// ─── Context interface ────────────────────────────────────────────────────────
// Giữ nguyên interface cũ để các consumer (App.tsx, ...) không cần thay đổi

interface PassportContextType {
    isLoggedIn: boolean;
    isLoading: boolean;
    walletAddress: string | null;
    userEmail: string | null;
    login: () => Promise<string | null>;
    loginWithGoogle: () => Promise<string | null>;
    logout: () => Promise<void>;
    /** @deprecated Passport đã được thay bằng Privy, luôn trả về null */
    passportInstance: null;
    /** Lấy EIP-1193 provider để call contract trên bất kỳ chain nào */
    getEthereumProvider: () => Promise<unknown>;
    /** Switch wallet tới chain khác, returns true nếu thành công */
    switchChain: (chainId: number) => Promise<boolean>;
    /** Chain ID hiện tại của active wallet */
    activeChainId: number | null;
}

const PassportContext = createContext<PassportContextType>({
    isLoggedIn: false,
    isLoading: true,
    walletAddress: null,
    userEmail: null,
    login: async () => null,
    loginWithGoogle: async () => null,
    logout: async () => {},
    passportInstance: null,
    getEthereumProvider: async () => { throw new Error('No wallet connected'); },
    switchChain: async () => false,
    activeChainId: null,
});

export const usePassport = () => useContext(PassportContext);

// ─── Inner bridge (phải nằm bên trong PrivyProvider) ─────────────────────────

function PrivyContextBridge({ children }: { children: ReactNode }) {
    const { ready, authenticated, user, login, logout } = usePrivy();
    const { wallets } = useWallets();

    // Ưu tiên embedded wallet, fallback sang wallet ngoài (MetaMask, v.v.)
    const activeWallet =
        wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0] ?? null;

    const walletAddress = activeWallet?.address ?? null;
    const userEmail = user?.email?.address ?? null;

    const handleLogin = async (): Promise<string | null> => {
        // Privy mở modal, resolve khi modal đóng (login xong hoặc bị tắt)
        login();
        // Sau login, wallets được populate qua useWallets reactive
        return activeWallet?.address ?? null;
    };

    const handleLogout = async (): Promise<void> => {
        await logout();
    };

    const getEthereumProvider = async (): Promise<unknown> => {
        if (!activeWallet) throw new Error('No wallet connected');
        return activeWallet.getEthereumProvider();
    };

    const switchChain = async (chainId: number): Promise<boolean> => {
        if (!activeWallet) return false;
        const supported = SUPPORTED_CHAINS.find((c) => c.id === chainId);
        if (!supported) return false;
        try {
            await activeWallet.switchChain(chainId);
            return true;
        } catch (e) {
            console.error('[Privy] switchChain failed:', e);
            return false;
        }
    };

    const activeChainId = activeWallet?.chainId
        ? parseInt(activeWallet.chainId.replace('eip155:', ''), 10) || null
        : null;

    const value: PassportContextType = {
        isLoggedIn: authenticated,
        isLoading: !ready,
        walletAddress,
        userEmail,
        login: handleLogin,
        loginWithGoogle: handleLogin,
        logout: handleLogout,
        passportInstance: null,
        getEthereumProvider,
        switchChain,
        activeChainId,
    };

    return (
        <PassportContext.Provider value={value}>
            {children}
        </PassportContext.Provider>
    );
}

// ─── Public Provider ──────────────────────────────────────────────────────────

export function PassportProvider({ children }: { children: ReactNode }) {
    if (!PRIVY_APP_ID) {
        console.warn('[Privy] NEXT_PUBLIC_PRIVY_APP_ID is not set');
    }

    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            config={privyConfig}
        >
            <PrivyContextBridge>
                {children}
            </PrivyContextBridge>
        </PrivyProvider>
    );
}
