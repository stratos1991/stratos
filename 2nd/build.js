// build.js
const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/server.ts'],
    outfile: 'dist/server.js',
    bundle: true,
    platform: 'node',
    target: 'node20', // Adjust to your Node version (e.g., node18, node20)
    minify: true, // This reduces the file size to the absolute minimum
    sourcemap: false, // Set to true if you need to debug the output
    external: ['node-pty'], // Native binary module, can't be bundled
  })
  .catch(() => process.exit(1));
