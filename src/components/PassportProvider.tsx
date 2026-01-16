'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { passport } from '@imtbl/sdk';
import { getPassportInstance } from '@/config/passport';

interface PassportContextType {
    isLoggedIn: boolean;
    isLoading: boolean;
    walletAddress: string | null;
    userEmail: string | null;
    login: () => Promise<string | null>;
    loginWithGoogle: () => Promise<string | null>;
    logout: () => Promise<void>;
    passportInstance: passport.Passport | null;
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
});

export const usePassport = () => useContext(PassportContext);

interface PassportProviderProps {
    children: ReactNode;
}

export function PassportProvider({ children }: PassportProviderProps) {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [passportInst, setPassportInst] = useState<passport.Passport | null>(null);

    // Initialize passport on mount
    useEffect(() => {
        const instance = getPassportInstance();
        setPassportInst(instance);

        // Check if user is already logged in
        const checkExistingSession = async () => {
            if (!instance) {
                setIsLoading(false);
                return;
            }

            try {
                // First check if we have an ID token (indicates existing session)
                const idToken = await instance.getIdToken();

                if (idToken) {
                    // Get user info
                    try {
                        const userInfo = await instance.getUserInfo();
                        if (userInfo) {
                            setUserEmail(userInfo.email || null);
                        }
                    } catch {
                        // User info not available
                    }

                    // Connect EVM to get wallet address (uses cached session)
                    try {
                        const provider = await instance.connectEvm();
                        const accounts = await provider.request({ method: 'eth_accounts' });

                        if (accounts && accounts.length > 0) {
                            setWalletAddress(accounts[0]);
                            setIsLoggedIn(true);
                        } else {
                            // Try requesting accounts
                            const requestedAccounts = await provider.request({ method: 'eth_requestAccounts' });
                            if (requestedAccounts && requestedAccounts.length > 0) {
                                setWalletAddress(requestedAccounts[0]);
                                setIsLoggedIn(true);
                            }
                        }
                    } catch (evmError) {
                    }
                } else {
                }
            } catch (error) {
                // User not logged in - this is expected
            } finally {
                setIsLoading(false);
            }
        };

        checkExistingSession();
    }, []);

    // Standard login (shows all options)
    const login = useCallback(async (): Promise<string | null> => {
        if (!passportInst) {
            return null;
        }

        try {
            setIsLoading(true);

            // Connect EVM and request accounts
            const provider = await passportInst.connectEvm();
            const accounts = await provider.request({ method: 'eth_requestAccounts' });

            if (accounts && accounts.length > 0) {
                const address = accounts[0];
                setWalletAddress(address);
                setIsLoggedIn(true);

                // Get user info for email
                try {
                    const userInfo = await passportInst.getUserInfo();
                    setUserEmail(userInfo?.email || null);
                } catch {
                    // Email not available
                }

                return address;
            }

            return null;
        } catch (error) {
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [passportInst]);

    // Direct Google login
    const loginWithGoogle = useCallback(async (): Promise<string | null> => {
        if (!passportInst) {
            return null;
        }

        try {
            setIsLoading(true);

            // Login with Google directly
            await passportInst.login({
                useCachedSession: false,
            });

            // After login, connect EVM to get wallet address
            const provider = await passportInst.connectEvm();
            const accounts = await provider.request({ method: 'eth_requestAccounts' });

            if (accounts && accounts.length > 0) {
                const address = accounts[0];
                setWalletAddress(address);
                setIsLoggedIn(true);

                // Get user info for email
                try {
                    const userInfo = await passportInst.getUserInfo();
                    setUserEmail(userInfo?.email || null);
                } catch {
                    // Email not available
                }

                return address;
            }

            return null;
        } catch (error) {
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [passportInst]);

    // Logout
    const logout = useCallback(async (): Promise<void> => {
        if (!passportInst) {
            return;
        }

        try {
            await passportInst.logout();
        } catch (error) {
        } finally {
            setIsLoggedIn(false);
            setWalletAddress(null);
            setUserEmail(null);
        }
    }, [passportInst]);

    const value: PassportContextType = {
        isLoggedIn,
        isLoading,
        walletAddress,
        userEmail,
        login,
        loginWithGoogle,
        logout,
        passportInstance: passportInst,
    };

    return (
        <PassportContext.Provider value={value}>
            {children}
        </PassportContext.Provider>
    );
}
