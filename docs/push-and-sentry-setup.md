# Push notifications and Sentry — setup

The code is in place; each part turns on once its settings exist.

## Push notifications (Firebase + Expo)

How it works: the app registers each phone's Expo push token
(`tips_crm_register_push_token`). Every row added to `tips_crm.notifications`
is sent to the recipient's phones by the `send_notification_push` database
trigger through the Expo push service. Android delivery goes through Firebase.

1. Firebase console → Project settings → Add app → Android, package name
   **`com.app.tipsdistributioncrm`** (must match exactly).
2. Download `google-services.json` and put it at the repository root
   (or, on expo.dev, add it as a *file* environment variable named
   `GOOGLE_SERVICES_JSON`).
3. Firebase → Project settings → Service accounts → *Generate new private key*.
   Upload that JSON on expo.dev → project → Credentials → Android →
   *FCM V1 service account key*. Do not commit this file; it is a secret.
4. Build a new APK. Users are asked for notification permission once after
   sign-in.

## Sentry

| Where | Variable | Value |
|---|---|---|
| expo.dev → Environment variables (and `eas.json` env) | `EXPO_PUBLIC_SENTRY_DSN` | the React Native project's DSN |
| expo.dev → Environment variables, *secret* | `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens |
| expo.dev → Environment variables | `SENTRY_ORG`, `SENTRY_PROJECT` | organization and project slugs |
| hPanel → Node.js → Environment variables | `SENTRY_DSN` | the server (Node) project's DSN |

- Without `EXPO_PUBLIC_SENTRY_DSN` the app reports nothing.
- Without `SENTRY_AUTH_TOKEN` (plus org and project) builds still work, but
  stack traces are not readable because source maps are not uploaded.
- Without `SENTRY_DSN` the server reports nothing.
- Only the account id and company id are attached to errors, never names or emails.
