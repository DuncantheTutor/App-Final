# Two-Phone Prototype Parity Checklist

Use this with two physical phones:
- Phone A signed in as user A
- Phone B signed in as user B

## 0) Backend status
- Run `npm run prototype:parity:report`
- Confirm report warns if Functions deploy is blocked by non-Blaze plan.
- Confirm release APK path + timestamp are current.

## 1) Auth parity
- On A: signup/login via email + OTP + password.
- On B: signup/login via email + OTP + password.
- Expected: both land in app without mock-account fallback prompts.

## 1b) Single-device lock parity
- Keep account X logged in on A.
- On B: try to log in as account X.
- Expected: B is blocked with "account already active on another device" message.
- On A: tap Logout.
- On B: retry login as account X.
- Expected: login now succeeds.

## 2) Friend pairing parity (default **NFC PIN**)
- Deploy **`registerNfcPinPairOffer`**, **`cancelNfcPinPairOffer`**, **`getNfcPinPairOfferStatus`**, **`confirmNfcPinPairOffer`** to production Firebase (BLE callables remain optional / siloed).
- On **B:** Add Friend → **Join** / **Receive**, arm NFC read, hold **Add Friend+** (wait for “ready to read” state per UI).
- On **A:** Add Friend → **Share** / **Transmit**, hold **Add Friend+** after the server session is ready; complete NFC tap **second** so the PIN crosses to **B** (PIN is **not** shown on screen; it travels only over NFC).
- Expected: friendship edge is accepted and both users become visible as friends.
- Optional broader pass: **`FEATURE_TEST_SCENARIOS.md`** § **Whole-account smoke** (sign-in → post → chat → unfriend).

## 3) Private post thread parity
- On A: publish a feed post.
- On B: add private comment to A post.
- Expected:
  - A sees B comment card under post.
  - B sees own private chain.
  - Any third account C does not see this private chain.

## 4) Thread replies + reactions parity
- On A: reply in thread with B.
- On B: react to A reply with thumbs up.
- Expected:
  - Reply shows on both A and B within polling window.
  - Reaction count updates on both A and B.
  - C cannot view or react to this private thread.

## 5) Negative visibility checks
- Verify B cannot read private threads for A posts where B is not the designated friend.
- Verify A cannot open private thread message history for unrelated users.
- Expected: backend denies access and UI does not reveal unauthorized data.

## 6) Regression sweep
- Check feed "New Post" button still matches approved UI.
- Check chat screen layout unchanged.
- Confirm no new padding/flow regressions.
- Confirm closing/reopening app keeps user signed in on same device (without pressing Logout).
