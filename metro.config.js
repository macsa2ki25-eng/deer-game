// ゲーム本体（src/）は Vite が組み立てて native/game-html.ts に畳まれるので、
// Metro には見せない。見せると DOM 前提のコードを解決しようとして失敗する。
//
// 正規表現は**プロジェクト直下に固定する**こと。
// ただの /src/ にすると node_modules/expo/src まで巻き込んで、
// expo 本体が解決できなくなる（実際なった）。
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const own = (dir) => {
  const abs = path.join(__dirname, dir);
  return new RegExp(`^${abs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/]`);
};
config.resolver.blockList = [own("src"), own("dist"), own("test"), own("tools")];

module.exports = config;
