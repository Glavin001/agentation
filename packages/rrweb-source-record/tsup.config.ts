import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["rrweb", "rrweb-snapshot", "@glavin001/agentation", "react", "react-dom"],
});
