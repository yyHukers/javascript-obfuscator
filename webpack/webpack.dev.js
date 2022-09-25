const HtmlWebpackPlugin = require("html-webpack-plugin");

const webpack = require("webpack");
const packageJson = require("pjson");

const WebpackUtils = require("./utils/WebpackUtils").WebpackUtils;

const path = require("path");

module.exports = {
  mode: "development",
  context: path.resolve(__dirname, ".."),
  entry: {
    // index: "./src/JavaScriptObfuscator.ts",
    // index: "./index.ts",
    debug: "./debug/index.js",
  },
  target: "web",
  resolve: {
    alias: {
      assert: "assert",
    },
    extensions: [".ts", ".js"],
  },
  devServer: {
    compress: true,
    port: 9000,
  },
  output: {
    path: path.resolve(__dirname, "../dist"),
    // libraryTarget: "umd",
    // library: "JavaScriptObfuscator",
    filename: "index.browser.js",
  },
  module: {
    exprContextCritical: false,
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: WebpackUtils.getBannerText(WebpackUtils.getLicenseText()),
      raw: true,
      entryOnly: false,
    }),
    new webpack.EnvironmentPlugin({
      VERSION: packageJson.version,
    }),
    new webpack.ProvidePlugin({
      process: ["process"],
    }),
    new HtmlWebpackPlugin(),
  ],
};
