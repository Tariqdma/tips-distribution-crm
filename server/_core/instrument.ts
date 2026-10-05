import * as Sentry from "@sentry/node";

// Loaded before express so Sentry can instrument it. Off unless SENTRY_DSN is
// set in the host's environment variables (hPanel).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
