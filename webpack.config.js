const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.glsl/, //load these files as text strings
        type: 'asset/source' 
      },
      {
        test: /\.(png|jpe?g|gif)$/i,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
    ],
  },
  mode: 'development',
  entry: '/src/index.js',
  plugins: [new HtmlWebpackPlugin(), new CopyWebpackPlugin({
    patterns: [
      { from: 'assets', globOptions: {ignore: ['**/*.DS_Store', '**/*.gitkeep']} }
    ]})
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
  },
};