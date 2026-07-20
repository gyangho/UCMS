import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // 2026-07-16: Docker Compose routes React API calls to the web service name; local npm dev keeps localhost.
      "/api": apiProxyTarget,
      // 2026-07-16: Kakao login still starts from the existing Node auth controller while React owns /login.
      "/auth/authorize": apiProxyTarget,
      "/auth/redirect": apiProxyTarget,
      "/auth/regenerate-code": apiProxyTarget,
      "/auth/checkAuthCompleted": apiProxyTarget,
      "/auth/cancelAuth": apiProxyTarget,
      "/auth/confirm-member": apiProxyTarget
    }
  }
});
