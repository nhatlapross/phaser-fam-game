import { config, passport } from '@imtbl/sdk';

// Determine environment based on NODE_ENV or custom env variable
const isProduction = process.env.NODE_ENV === 'production';

// Get base URL for redirects
const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }
    // Fallback for SSR
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8080';
};

// Create Passport instance - only on client side
let passportInstance: passport.Passport | null = null;

export const getPassportInstance = (): passport.Passport | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    if (!passportInstance) {
        try {
            const baseUrl = getBaseUrl();

            passportInstance = new passport.Passport({
                baseConfig: {
                    environment: isProduction
                        ? config.Environment.PRODUCTION
                        : config.Environment.SANDBOX,
                    publishableKey: process.env.NEXT_PUBLIC_IMMUTABLE_PUBLISHABLE_KEY || '',
                },
                clientId: process.env.NEXT_PUBLIC_IMMUTABLE_CLIENT_ID || '',
                redirectUri: `${baseUrl}/redirect`,
                logoutRedirectUri: `${baseUrl}/logout`,
                audience: 'platform_api',
                scope: 'openid offline_access email transact',
            });
        } catch (error) {
            console.error('Failed to initialize Passport:', error);
            return null;
        }
    }

    return passportInstance;
};

// Export for direct import
export { passportInstance };
