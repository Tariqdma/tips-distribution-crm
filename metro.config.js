const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Native iOS development uses a physical stylesheet. Production web exports
  // keep the stylesheet virtual to avoid a Metro cache race in clean builders.
  forceWriteFileSystem: process.env.NODE_ENV !== "production",
});
