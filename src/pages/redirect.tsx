import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getPassportInstance } from '@/config/passport';

export default function RedirectPage() {
    const router = useRouter();
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            const passportInstance = getPassportInstance();

            if (!passportInstance) {
                setStatus('error');
                setError('Passport not initialized');
                return;
            }

            try {
                // Process the login callback
                await passportInstance.loginCallback();
                setStatus('success');

                // If this is a popup, notify parent and close
                if (window.opener) {
                    window.opener.postMessage('authComplete', window.origin);
                    window.close();
                } else {
                    // Redirect to home page
                    router.push('/');
                }
            } catch (err) {
                console.error('Login callback error:', err);
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Login failed');

                // Redirect to home after error
                setTimeout(() => {
                    router.push('/');
                }, 3000);
            }
        };

        handleCallback();
    }, [router]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#1a1a2e',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
        }}>
            {status === 'processing' && (
                <>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '4px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#4ade80',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <p style={{ marginTop: '20px', fontSize: '18px' }}>
                        Processing login...
                    </p>
                    <style jsx>{`
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                </>
            )}

            {status === 'success' && (
                <p style={{ fontSize: '18px', color: '#4ade80' }}>
                    Login successful! Redirecting...
                </p>
            )}

            {status === 'error' && (
                <>
                    <p style={{ fontSize: '18px', color: '#ef4444' }}>
                        Login failed
                    </p>
                    {error && (
                        <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '10px' }}>
                            {error}
                        </p>
                    )}
                    <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '10px' }}>
                        Redirecting to home...
                    </p>
                </>
            )}
        </div>
    );
}
