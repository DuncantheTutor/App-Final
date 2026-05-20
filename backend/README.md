# Backend MVP Blueprint (Strict Privacy Mode B)

This backend enforces four core principles:

1. One-device-only active session per account.
2. NFC handshake flow for friend creation.
3. Friends-only visibility.
4. Encrypted-at-application-layer data for profiles, posts, chat, and media.

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
- `createEncryptedPost(deviceId, ciphertext, nonce, envelopes, mediaObjectPath?)`
- `sendEncryptedMessage(deviceId, conversationId, ciphertext, nonce, envelopes)`
- `getFriendKeyBundles(friendUids[])`

## Data shape (high-level)

- `users/{uid}`: active device session, key bundle metadata.
- `friendships/{minUid_maxUid}`: accepted friendship edge.
- `handshakes/{code}`: short-lived NFC pairing codes.
- `encryptedProfiles/{uid}`: encrypted profile blob.
- `encryptedPosts/{postId}`: encrypted post payload + recipient envelopes.
- `conversations/{conversationId}/messages/{messageId}`: encrypted chat payloads.

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
