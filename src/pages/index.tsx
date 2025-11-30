import Head from "next/head";
import dynamic from "next/dynamic";

const AppWithoutSSR = dynamic(() => import("@/App"), { ssr: false });

export default function Home() {
    return (
        <>
            <Head>
                <title>Farming Game</title>
                <meta name="description" content="A farming game built with Phaser 3 and Next.js" />
                {/* Mobile viewport - prevent zoom, enable fullscreen */}
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
                {/* Mobile web app capable */}
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                {/* Theme color for mobile browser */}
                <meta name="theme-color" content="#1a1a2e" />
                <link rel="icon" href="/favicon.png" />
                <link rel="apple-touch-icon" href="/favicon.png" />
            </Head>
            <AppWithoutSSR />
        </>
    );
}
