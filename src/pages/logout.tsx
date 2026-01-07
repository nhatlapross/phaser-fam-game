import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LogoutPage() {
    const router = useRouter();

    useEffect(() => {
        // Clear local storage
        if (typeof window !== 'undefined') {
            localStorage.removeItem('fam_game_access_token');
            localStorage.removeItem('fam_game_user_data');
            localStorage.removeItem('fam_game_user_badges');
            localStorage.removeItem('fam_game_is_new_user');
            localStorage.removeItem('fam_game_show_transformation');
        }

        // Redirect to home after a brief delay
        const timer = setTimeout(() => {
            router.push('/');
        }, 1500);

        return () => clearTimeout(timer);
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
            <p style={{ fontSize: '18px', color: '#4ade80' }}>
                Successfully logged out
            </p>
            <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '10px' }}>
                Redirecting to home...
            </p>
        </div>
    );
}
