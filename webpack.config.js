const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2', // Ensures compatibility with Node.js module system
  },
  
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'codeboltagent.yaml', to: './' }, // Copy codeboltagent.yaml to the dist folder
      ],
    }),
  ],
  externalsPresets: { node: true }, // Ensures Node.js built-in modules are not bundled
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: {
                    node: 'current', // Ensure compatibility with the current Node.js version
                  },
                },
              ],
            ],
          },
        },
      },
      {
        test: /\.handlebars$/,
        use: 'handlebars-loader', // Process .handlebars files
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.handlebars'], // Include .handlebars in resolvable extensions
    fallback: {
      path: require.resolve('path-browserify'), // Polyfill 'path' for browser compatibility
    },
  },
  experiments: {
    topLevelAwait: true, // Enable top-level await for dynamic imports
  },
  optimization: {
    minimize: false, // Disable minimization for easier debugging
  },
};
