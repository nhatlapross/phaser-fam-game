import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Privy xử lý OAuth callback nội bộ — trang này chỉ cần redirect về home.
export default function RedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/');
    }, [router]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: '#1a1a2e',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
        }}>
            Redirecting...
        </div>
    );
}
