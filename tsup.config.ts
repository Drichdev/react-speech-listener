import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react"],
  // Next.js App Router : le hook doit vivre côté client.
  banner: { js: '"use client";' },
});
