const esbuild = require('esbuild');

// Build configuration
esbuild.build({
  entryPoints: ['./src/index.ts'], // Path to the TypeScript entry file
  outfile: './dist/index.js',        // Output file
  bundle: true,                      // Bundle all dependencies
  platform: 'node',                  // Target Node.js platform
  format: 'cjs',                     // Use CommonJS format for Node.js compatibility
  sourcemap: true,                   // Include source maps
  minify: false,                      // Minify the output
  target: ['es2020'],                // Target ES2020 JavaScript features
}).then(() => {
  console.log('Build completed!');
}).catch((err) => {
  console.error('Build failed:', err);
});
