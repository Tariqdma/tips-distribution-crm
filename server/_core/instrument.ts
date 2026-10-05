import * as Sentry from "@sentry/node";
import { DEFAULT_SENTRY_DSN } from "../../shared/sentry";

// Loaded before express so Sentry can instrument it. Reports only in
// production; SENTRY_DSN in hPanel overrides the shared project DSN.
const dsn = process.env.NODE_ENV === "production" ? process.env.SENTRY_DSN || DEFAULT_SENTRY_DSN : process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
  Sentry.setTag("platform", "server");
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
