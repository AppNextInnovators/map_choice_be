module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: {
        strict: false,
      },
      diagnostics: {
        warnOnly: true,
      },
    }],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/__tests__/**"],
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
  testTimeout: 10000,
  forceExit: true,
};
