// ゲーム本体（src/）は Vite が組み立てて native/game-html.ts に畳まれるので、
// Metro には見せない。見せると DOM 前提のコードを解決しようとして失敗する。
const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/src/defaults/exclusionList");

const config = getDefaultConfig(__dirname);
config.resolver.blockList = exclusionList([/\/src\/.*/, /\/dist\/.*/, /\/test\/.*/]);
module.exports = config;
