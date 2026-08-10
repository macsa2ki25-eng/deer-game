import { defineConfig } from "vite";

export default defineConfig({
  // Capacitor でローカル同梱するので相対パスで出す（file:// でも動く）
  base: "./",
  build: {
    target: "es2020",
    // 素材は全部コード内で生成しているので、出力は index.html + js だけになる
    assetsInlineLimit: 1024 * 1024,
  },
});
