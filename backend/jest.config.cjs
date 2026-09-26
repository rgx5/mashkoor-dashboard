/** Unit tests live next to the code (`*.spec.ts`). End-to-end tests are in `test/e2e` and run with `pnpm test:e2e`. */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }] },
};
