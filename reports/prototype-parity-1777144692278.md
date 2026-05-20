# Prototype Parity Report
Generated: 2026-04-25T19:18:12.277Z

## Firebase Target
- app.json projectId: nfc-app-7095e
- app.json useFirebaseEmulators: true
- .firebaserc default: demo-app
- warning: .firebaserc default does not match app project. Use explicit --project nfc-app-7095e in deploy commands.

## Backend Deploy Status
- Firestore rules deploy: expected to succeed on Spark/Blaze.
- Functions deploy: requires Blaze plan because Cloud Build + Artifact Registry APIs must be enabled.
- Recommended deploy commands:
  - firebase deploy --project nfc-app-7095e --only "firestore:rules"
  - firebase deploy --project nfc-app-7095e --only "functions,firestore:rules"

## APK Artifact
- path: android/app/build/outputs/apk/release/app-release.apk
- sizeBytes: 71502746
- lastModified: 2026-04-25T19:06:30.956Z

## Two-Phone Parity Gate
- Gate A: A and B can sign up/login with OTP + password.
- Gate B: A/B can add each other via NFC handshake.
- Gate C: A post appears on B; B private comment appears on A only.
- Gate D: A/B thread replies and reactions sync both phones.
- Gate E: Non-participant cannot see private thread.
