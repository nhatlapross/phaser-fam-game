'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { PRIVY_APP_ID, privyConfig } from '@/config/privy';

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

    const value: PassportContextType = {
        isLoggedIn: authenticated,
        isLoading: !ready,
        walletAddress,
        userEmail,
        login: handleLogin,
        loginWithGoogle: handleLogin, // Privy hiện modal, user chọn Google
        logout: handleLogout,
        passportInstance: null,
        getEthereumProvider,
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
