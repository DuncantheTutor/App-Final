"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePostStorageObjectPaths = normalizePostStorageObjectPaths;
exports.resolveFirebaseAuthUidForAppUid = resolveFirebaseAuthUidForAppUid;
exports.assertPostStoragePathsOwnedByAuthUid = assertPostStoragePathsOwnedByAuthUid;
exports.deletePostStorageObjectPaths = deletePostStorageObjectPaths;
exports.collectStoragePathsFromPostDoc = collectStoragePathsFromPostDoc;
const admin = __importStar(require("firebase-admin"));
const firebaseAdmin_1 = require("./firebaseAdmin");
const ENCRYPTED_MEDIA_PREFIX = "encrypted-media/";
/** Normalize client/server storage paths for post media under `encrypted-media/{authUid}/…`. */
function normalizePostStorageObjectPaths(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = new Set();
    for (const entry of raw) {
        const path = String(entry ?? "").trim().replace(/^\/+/, "");
        if (!path || path.includes(".."))
            continue;
        if (!path.startsWith(ENCRYPTED_MEDIA_PREFIX))
            continue;
        const rest = path.slice(ENCRYPTED_MEDIA_PREFIX.length);
        const slash = rest.indexOf("/");
        if (slash < 1 || slash === rest.length - 1)
            continue;
        const authSegment = rest.slice(0, slash);
        const objectId = rest.slice(slash + 1);
        if (!/^[A-Za-z0-9_-]+$/.test(authSegment))
            continue;
        if (!/^[A-Za-z0-9_.-]+$/.test(objectId))
            continue;
        out.add(`${ENCRYPTED_MEDIA_PREFIX}${authSegment}/${objectId}`);
    }
    return [...out];
}
async function resolveFirebaseAuthUidForAppUid(appUid) {
    const trimmed = appUid.trim();
    if (!trimmed)
        return null;
    const snap = await (0, firebaseAdmin_1.getFirestore)().collection("userFirebaseAuthMap").doc(trimmed).get();
    const authUid = snap.data()?.firebaseAuthUid?.trim();
    return authUid || null;
}
function assertPostStoragePathsOwnedByAuthUid(paths, ownerAuthUid) {
    const prefix = `${ENCRYPTED_MEDIA_PREFIX}${ownerAuthUid}/`;
    for (const path of paths) {
        if (!path.startsWith(prefix)) {
            throw new Error(`storage path not owned by post author: ${path}`);
        }
    }
}
/**
 * Best-effort delete of Storage objects referenced by a post. Failures are logged
 * but do not fail the Firestore delete (orphan cleanup can be retried manually).
 */
async function deletePostStorageObjectPaths(paths) {
    const unique = [...new Set(paths)];
    if (unique.length === 0)
        return;
    const bucket = admin.storage().bucket();
    await Promise.all(unique.map(async (objectPath) => {
        try {
            await bucket.file(objectPath).delete({ ignoreNotFound: true });
        }
        catch {
            /* ignore — post already removed from feed */
        }
    }));
}
/** Legacy single-path field + `storageObjectPaths` array on the post doc. */
function collectStoragePathsFromPostDoc(data) {
    const paths = normalizePostStorageObjectPaths(data.storageObjectPaths);
    const legacy = String(data.mediaObjectPath ?? "").trim().replace(/^\/+/, "");
    if (legacy && legacy.startsWith(ENCRYPTED_MEDIA_PREFIX) && !legacy.includes("..")) {
        paths.push(...normalizePostStorageObjectPaths([legacy]));
    }
    return [...new Set(paths)];
}
