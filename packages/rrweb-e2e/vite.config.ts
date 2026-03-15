import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: "automatic",
  },
  server: {
    port: 3399,
  },
});
