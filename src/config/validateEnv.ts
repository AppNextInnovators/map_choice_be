// App will not function without these
const REQUIRED_ENV_VARS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GOOGLE_GEOCODING_API_KEY",
  "NODE_ENV",
];

// These have code-level defaults but should be explicitly set in production
const OPTIONAL_ENV_VARS = [
  "DAILY_REQUEST_LIMIT",
  "MONTHLY_REQUEST_LIMIT",
  "GLOBAL_GEOCODING_LIMIT",
  "RATE_LIMIT_WINDOW_MINUTES",
  "RATE_LIMIT_MAX",
  "LOG_LEVEL",
  "ALLOWED_ORIGINS",
];

export const validateEnv = (): void => {
  const missingRequired = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missingRequired.length > 0) {
    console.error(`Missing required environment variables: ${missingRequired.join(", ")}`);
    process.exit(1);
  }

  const missingOptional = OPTIONAL_ENV_VARS.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn(`Missing optional environment variables (defaults will be used): ${missingOptional.join(", ")}`);
  }
};
