import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";
const shareDbProxyTarget =
  process.env.VITE_SHAREDB_PROXY_TARGET ?? "ws://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: true,
      interval: 250,
    },
    proxy: {
      // 2026-07-16: Docker Compose routes React API calls to the web service name; local npm dev keeps localhost.
      "/api": apiProxyTarget,
      // 2026-07-23: Preserve the browser-visible host so Kakao never receives the Docker service URL.
      "/auth/authorize": {
        target: apiProxyTarget,
        changeOrigin: false,
        xfwd: true,
      },
      "/auth/redirect": {
        target: apiProxyTarget,
        changeOrigin: false,
        xfwd: true,
      },
      "/auth/regenerate-code": apiProxyTarget,
      "/auth/checkAuthCompleted": apiProxyTarget,
      "/auth/cancelAuth": apiProxyTarget,
      "/auth/confirm-member": apiProxyTarget,
      // 2026-07-23: Direct Vite access must proxy the evaluation-note WebSocket just like Nginx.
      "/sharedb": {
        target: shareDbProxyTarget,
        ws: true,
      },
    },
  },
});
