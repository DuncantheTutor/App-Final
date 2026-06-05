# Backend MVP Blueprint (Strict Privacy Mode B)

This backend enforces four core principles:

1. One-device-only active session per account.
2. NFC handshake flow for friend creation.
3. Friends-only visibility.
4. Encrypted-at-application-layer data for profiles, posts, chat, and media.
5. On-device **AsyncStorage** social cache is **plaintext** (`app/lib/encryptedLocalStorage.ts` wrapper). **Tier B** downloaded media files remain encrypted on disk (`app/lib/tierBMedia/`, legacy `encryptedMediaCache.ts`).

## Folder structure

- `functions/`: Cloud Functions TypeScript project.
- `firestore.rules`: Firestore ACL rules for friend-only encrypted docs.
- `storage.rules`: Storage ACL rules for encrypted media objects.

## Cloud Functions (implemented stubs)

- `claimDeviceSession(deviceId)`
- `createHandshake(deviceId)`
- `consumeHandshake(handshakeCode, receiverDeviceId)`
- `publishUserKeyBundle(deviceId, keyVersion, encryptionPublicKey, identitySigningPublicKey)`
- `putEncryptedProfile(deviceId, ciphertext, nonce, envelopes)`
- `createEncryptedPost(deviceId, ciphertext, nonce, envelopes, storageObjectPaths?)` — optional `encrypted-media/{firebaseAuthUid}/…` paths for server-side Storage cleanup on delete
- `deleteEncryptedPost(deviceId, postId)` — removes Firestore post + referenced Storage objects
- `sendEncryptedMessage(deviceId, conversationId, ciphertext, nonce, envelopes)`
- `getFriendKeyBundles(friendUids[])`

## Data shape (high-level)

- `users/{uid}`: active device session, key bundle metadata.
- `friendships/{minUid_maxUid}`: accepted friendship edge.
- `handshakes/{code}`: short-lived NFC pairing codes.
- `encryptedProfiles/{uid}`: encrypted profile blob.
- `encryptedPosts/{postId}`: encrypted post payload + recipient envelopes.
- `conversations/{conversationId}/messages/{messageId}`: encrypted chat payloads.

## Dev helper: make two users friends (test only)

Normal friending goes through in-person NFC PIN pair. For emulator / QA you can write the Firestore edge directly:

```bash
# Production (requires Application Default Credentials or service account)
npm run make:friends -- user-a@example.com user-b@example.com

# Firestore emulator (start emulator first)
npm run make:friends -- --emulator user-a@test.com user-b@test.com

# App uids directly
npm run make:friends -- u_habc123 u_hdef456
```

Script: `scripts/make-friends.mjs`. Both accounts should have signed in at least once (`users/{uid}` must exist). Emails are canonicalized the same way as the app (`backendUidForEmail`).

**Doc ID must be sorted app UIDs:** `u_smaller_u_larger` (lexicographic). A reversed id (e.g. `u_hb7…_u_h38…` when `u_h38…` sorts first) still lets `listMyFriends` find the edge, but **posts will not publish or backfill** until the canonical doc exists or you deploy the May 2026 server fallback. Prefer `npm run make:friends` over hand-editing the Console.

**Posts after manual friendship:** Encrypted posts are friends-only at publish time. Older posts are **not** visible until **each author's phone** runs the background re-share (`listMyOwnedEncryptedPosts` + `updateEncryptedPost`). After creating a manual edge:

1. Both users open the app (foreground) once so roster sync and post backfill run.
2. Wait ~1–2 minutes, then pull feed (switch away from Feed tab and back).
3. **New posts** after friendship require both users in each other's friend roster (boot `listMyFriends` or realtime listener with `participantAuthUids` populated).

If posts still never appear, check Firestore `encryptedPosts/{postId}`: the viewer's app uid must be in `recipientUids` and `envelopes[viewerUid]`, and their Firebase Auth uid in `recipientAuthUids`.

**Chat push notifications:** When a message is sent successfully, the backend looks up each recipient's device tokens at `users/{appUid}/pushTokens`. The **recipient** must have granted OS notification permission (Allow on the in-app pre-prompt or in phone Settings) and opened the app at least once while signed in so the token is registered. The **sender** must pass friendship checks on `sendEncryptedMessage` (same canonical friendship doc / deployed server fallback as posts). If messages only appear after you open the app but never as lock-screen alerts, check the recipient's `users/{uid}/pushTokens` subcollection in Firestore.

The callable `seedDemoFriendships` also exists but requires an active device session from one caller and is only wired in demo-offline mode on the client.

## Crypto contract (client-side)

The server never stores plaintext profile/chat/post/media data.

- Per-object random content key.
- Payload encrypted with AEAD (recommended: XChaCha20-Poly1305).
- Content key wrapped per recipient using recipient public key.
- Stored fields:
  - `ciphertext`
  - `nonce`
  - `envelopes: { [uid]: wrappedKey }`

## Suggested next implementation passes

1. Add Firebase project config (`firebase.json`, emulator config).
2. Wire frontend callables to these function names.
3. Add client crypto helper module (key generation, envelope wrap/unwrap).
4. Add media encryption/decryption pipeline for upload/download.
5. Add key rotation + rewrap strategy for session/device replacement.
