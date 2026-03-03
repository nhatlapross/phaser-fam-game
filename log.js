// Simple dev/build logger
const mode = process.argv[2] || 'dev';
console.log(`[${new Date().toISOString()}] Starting ${mode} mode...`);
