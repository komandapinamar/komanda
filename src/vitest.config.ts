import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const serverOnlyShim = fileURLToPath(
  new URL("./tests/server-only.ts", import.meta.url),
);

const shared = {
  environment: "node" as const,
  setupFiles: ["./tests/setup.ts"],
  restoreMocks: true,
  clearMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  testTimeout: 15_000,
  hookTimeout: 15_000,
};

const sharedProject = {
  resolve: {
    alias: {
      "@": root,
      "server-only": serverOnlyShim,
    },
  },
};

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": serverOnlyShim,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      exclude: [".next/**", "tests/**", "drizzle/**"],
    },
    projects: [
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "unit",
          include: [
            "tests/unit/**/*.test.ts",
            "tests/regression/**/*.{test,spec}.ts",
          ],
        },
      }),
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          sequence: { concurrent: false },
        },
      }),
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
        },
      }),
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "tenant-isolation",
          include: ["tests/tenant-isolation/**/*.test.ts"],
          sequence: { concurrent: false },
        },
      }),
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "migration",
          include: ["tests/migration/**/*.test.ts"],
          sequence: { concurrent: false },
        },
      }),
      defineProject({
        ...sharedProject,
        test: {
          ...shared,
          name: "database-compatibility",
          include: ["tests/database-compatibility/**/*.test.ts"],
          sequence: { concurrent: false },
          testTimeout: 30_000,
        },
      }),
    ],
  },
});
