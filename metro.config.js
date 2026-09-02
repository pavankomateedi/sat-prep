const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports a .wasm file that Metro doesn't treat as
// an asset by default, which breaks the web bundle.
config.resolver.assetExts.push('wasm');

module.exports = config;
