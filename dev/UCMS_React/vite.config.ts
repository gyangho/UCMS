import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const parsePort = (
  value: string | undefined,
  fallback: number,
  name: string,
) => {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
};

// 2026-07-24: Read local Vite env files and Docker-injected values from infra/env/ports.env.
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
  };
  const reactPort = parsePort(env.REACT_PORT, 3002, "REACT_PORT");
  const webPort = parsePort(env.WEB_PORT, 3000, "WEB_PORT");
  const shareDbPort = parsePort(env.SHAREDB_PORT, 3001, "SHAREDB_PORT");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ??
    `http://${env.VITE_API_PROXY_HOST ?? "localhost"}:${webPort}`;
  const shareDbProxyTarget =
    env.VITE_SHAREDB_PROXY_TARGET ??
    `ws://${env.VITE_SHAREDB_PROXY_HOST ?? "localhost"}:${shareDbPort}`;

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: reactPort,
      allowedHosts: env.DEV_HOST
        ? env.DEV_HOST.split(",")
            .map((host) => host.trim())
            .filter(Boolean)
        : [],
      watch: {
        usePolling: true,
        interval: 250,
      },
      proxy: {
        // 2026-07-16: Docker Compose routes React API calls to the web service name; local npm dev keeps localhost.
        "/api": apiProxyTarget,
        // 2026-08-22: Preserve the browser-visible host for cookie and callback origin checks.
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
  };
});
