import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false, // API is a standalone server, not a library
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["@opengrant/database"],
});
