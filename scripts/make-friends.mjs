#!/usr/bin/env node
/**
 * Dev/test helper: create an accepted `friendships` edge between two app users.
 *
 * Both users must have signed in at least once so `users/{uid}` exists (via
 * `claimDeviceSession`). For real-time friendship listeners, each user should
 * also have `userFirebaseAuthMap/{uid}` (happens on first app sign-in).
 *
 * Usage:
 *   node scripts/make-friends.mjs user-a@example.com user-b@example.com
 *   node scripts/make-friends.mjs u_habc123 u_hdef456
 *   node scripts/make-friends.mjs --emulator user-a@test.com user-b@test.com
 *   node scripts/make-friends.mjs --project nfc-app-7095e --dry-run a@x.com b@x.com
 *
 * Production: set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.
 * Emulator: start Firestore emulator first (`firebase emulators:start --only firestore`).
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require(join(__dirname, "../backend/functions/node_modules/firebase-admin"));

const DEFAULT_PROJECT_ID = "nfc-app-7095e";

/** Keep in sync with `canonicalizeEmail` in backendBridge.ts / backend functions. */
function canonicalizeEmail(email) {
  const trimmed = String(email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/** Keep in sync with `hashInput` in backendBridge.ts. */
function hashInput(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function backendUidForEmail(email) {
  return `u_${hashInput(canonicalizeEmail(email))}`;
}

function friendshipId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

function parseArgs(argv) {
  let projectId = DEFAULT_PROJECT_ID;
  let emulator = false;
  let dryRun = false;
  const positional = [];

  for (const arg of argv) {
    if (arg === "--emulator") {
      emulator = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--project=")) {
      projectId = arg.slice("--project=".length).trim() || projectId;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, projectId, emulator, dryRun, positional };
    }
    positional.push(arg);
  }

  return { help: false, projectId, emulator, dryRun, positional };
}

function resolveAppUid(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("u_")) return value;
  if (value.includes("@")) return backendUidForEmail(value);
  throw new Error(
    `Unrecognized identifier "${value}". Pass an email or app uid starting with u_.`
  );
}

async function resolveParticipantAuthUids(db, appUids) {
  const unique = [...new Set(appUids.filter(Boolean))];
  if (unique.length === 0) return [];
  const refs = unique.map((uid) => db.collection("userFirebaseAuthMap").doc(uid));
  const snaps = await db.getAll(...refs);
  const out = [];
  for (const snap of snaps) {
    const authUid = String(snap.data()?.firebaseAuthUid ?? "").trim();
    if (authUid) out.push(authUid);
  }
  return [...new Set(out)].sort();
}

function printHelp() {
  console.log(`\
make-friends — create an accepted Firestore friendship edge (dev/test only)

Usage:
  node scripts/make-friends.mjs [options] <user-a> <user-b>

Arguments:
  user-a, user-b   Sign-in email or app uid (u_…)

Options:
  --emulator       Use Firestore emulator at 127.0.0.1:8080
  --project=ID     Firebase project id (default: ${DEFAULT_PROJECT_ID})
  --dry-run        Print the edge that would be written without writing
  -h, --help       Show this help

Examples:
  node scripts/make-friends.mjs alice@test.com bob@test.com
  node scripts/make-friends.mjs --emulator alice@test.com bob@test.com
`);
}

async function main() {
  const { help, projectId, emulator, dryRun, positional } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }
  if (positional.length !== 2) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const uidA = resolveAppUid(positional[0]);
  const uidB = resolveAppUid(positional[1]);
  if (!uidA || !uidB) {
    console.error("Both user identifiers are required.");
    process.exitCode = 1;
    return;
  }
  if (uidA === uidB) {
    console.error("Cannot friend the same user with themselves.");
    process.exitCode = 1;
    return;
  }

  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }
  const db = admin.firestore();

  const edgeId = friendshipId(uidA, uidB);
  const participants = [uidA, uidB].sort();

  for (const uid of participants) {
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      console.warn(
        `Warning: users/${uid} does not exist. Have that account sign in once before friendship will appear in listMyFriends.`
      );
    }
  }

  const participantAuthUids = await resolveParticipantAuthUids(db, participants);
  if (participantAuthUids.length < participants.length) {
    console.warn(
      "Warning: one or both users lack userFirebaseAuthMap entries. Friendship will work via listMyFriends after sign-in, but the real-time friendships listener may not fire until they open the app."
    );
  }

  const edge = {
    participants,
    participantAuthUids,
    status: "accepted",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    seededByScript: true,
  };

  console.log(`Project:     ${projectId}${emulator ? " (emulator)" : ""}`);
  console.log(`Edge id:     friendships/${edgeId}`);
  console.log(`Participants: ${participants.join(", ")}`);
  console.log(`Auth UIDs:   ${participantAuthUids.length ? participantAuthUids.join(", ") : "(none yet)"}`);

  if (dryRun) {
    console.log("Dry run — no write performed.");
    return;
  }

  await db.collection("friendships").doc(edgeId).set(edge, { merge: true });
  console.log("Done. Both users should see each other after the next friends sync (reopen app or wait for listener).");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (/Could not load the default credentials|default credentials/i.test(message)) {
    console.error(`\
Could not authenticate to Firebase (production).

Fix one of these, then rerun from the repo root:

  Option A — one-time login (recommended):
    gcloud auth application-default login
    npm run make:friends -- user-a@example.com user-b@example.com

  Option B — service account JSON:
    1. Firebase Console → Project settings → Service accounts → Generate new private key
    2. In PowerShell (same terminal session):
       $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\key.json"
    3. npm run make:friends -- user-a@example.com user-b@example.com

  Option C — local emulator only (not your live phone accounts):
    firebase emulators:start --only firestore
    npm run make:friends -- --emulator user-a@test.com user-b@test.com

  Manual one-off: Firebase Console → Firestore → friendships → add doc
  (id = sorted uids joined by _, e.g. u_aaa_u_bbb) with participants + status: accepted.
`);
    process.exitCode = 1;
    return;
  }
  console.error(message);
  process.exitCode = 1;
});
