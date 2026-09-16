# Planning

Product specs, MVP plans, parity checklists, chat exports, and execution notes for **Erdos**.

## Where to work

- **Code and builds:** repository root `C:\Users\dunca\OneDrive\Desktop\Erdos` (open that folder in Cursor).
- **Git remote:** [github.com/DuncantheTutor/App-Final](https://github.com/DuncantheTutor/App-Final)
- **This folder:** documentation only; pair changes here with code updates at the repo root when behavior changes.

## Entry points

- `MASTER_PRODUCT_PLAN.md` — single planning entry point (scope + tombstone tickets)
- Client split (in progress): `app/shell/` (routing), `app/messaging/useMessagingController.ts` (chat state), `app/session/useBackendSession.ts` (device session), `app/session/useSignedInSession.ts` (signed-in / splash / sync flags), `app/feed/useFeedController.ts` (post rows), `app/friends/useFriendsController.ts` (roster / unfriend / links), `app/profile/useProfileController.ts` (my-profile + card cache), `app/addFriend/` (pair-offer register)
- **Your todo:** add Firebase Android apps `com.erdos.app` + `.demo` on existing project `nfc-app-7095e` (see `MASTER_PRODUCT_PLAN.md`) — do not create a new Firebase project
- `BUG_AUDIT_MAY2026_V4.md` — latest static bug audit (messaging, reactions, presence)
- `CHAT_FEED_IMPLEMENTATION_ROADMAP.md` — **May 2026** chat/feed IMPLEMENT vs TODO
- `NFC_QR_UNIFIED_PAIRING_PLAN.md` — NFC mirrors QR (button-only Send/Receive, opaque token, no hold-to-pair)
- `PLANNING.md` — requirements, architecture, phases
- `FRONTEND_REGRESSION_CHECKLIST.md` — pre-release UI checks
- `NEXT_STEPS_PARITY.txt` — short prioritized follow-ups
- `REAL_OTP_SIGNIN_COMMANDS.md` — PowerShell commands for Firebase/APK from the Erdos repo root
