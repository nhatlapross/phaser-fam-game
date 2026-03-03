/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "export",
    distDir: "dist",
    // Disable caching in development for faster hot reload
    onDemandEntries: {
        // Period (in ms) where the server will keep pages in the buffer
        maxInactiveAge: 25 * 1000,
        // Number of pages that should be kept simultaneously without being disposed
        pagesBufferLength: 2,
    },
    // Disable webpack cache in development
    webpack: (config, { dev, isServer }) => {
        if (dev) {
            config.cache = false;
        }
        return config;
    },
};

export default nextConfig;

