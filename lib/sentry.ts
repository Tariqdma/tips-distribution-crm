import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// Crash and error reporting. Off unless EXPO_PUBLIC_SENTRY_DSN is set at build
// time, and off in development so local errors do not reach the dashboard.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    environment: process.env.EXPO_PUBLIC_APP_ENV || (__DEV__ ? "development" : "production"),
    release: Constants.expoConfig?.version,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

/** Tags errors with the account and company, never with name or email. */
export function identifySentryUser(user: { id: string; companyId?: string | null } | null) {
  if (!dsn) return;
  Sentry.setUser(user ? { id: user.id } : null);
  Sentry.setTag("company_id", user?.companyId ?? "none");
}

export { Sentry };
