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
exports.storageObjectPathFromDownloadUrl = storageObjectPathFromDownloadUrl;
exports.normalizeOwnedMediaPath = normalizeOwnedMediaPath;
exports.mediaPathOwnedByAuthUid = mediaPathOwnedByAuthUid;
exports.profilePictureFieldsForStorage = profilePictureFieldsForStorage;
exports.profilePictureUrlForClient = profilePictureUrlForClient;
const admin = __importStar(require("firebase-admin"));
const ENCRYPTED_MEDIA_PREFIX = "encrypted-media/";
const SIGNED_URL_TTL_MS = 6 * 60 * 60 * 1000;
/** Firebase download URLs embed a long-lived token. Pull the object path out. */
function storageObjectPathFromDownloadUrl(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        const firebaseHost = host === "firebasestorage.googleapis.com" ||
            host.endsWith(".firebasestorage.app") ||
            host === "localhost" ||
            host === "127.0.0.1";
        if (!firebaseHost)
            return null;
        const marker = "/o/";
        const idx = url.pathname.indexOf(marker);
        if (idx < 0)
            return null;
        const decoded = decodeURIComponent(url.pathname.slice(idx + marker.length));
        return normalizeOwnedMediaPath(decoded);
    }
    catch {
        return null;
    }
}
function normalizeOwnedMediaPath(raw) {
    const path = String(raw ?? "").trim().replace(/^\/+/, "");
    if (!path || path.includes("..") || !path.startsWith(ENCRYPTED_MEDIA_PREFIX))
        return null;
    const rest = path.slice(ENCRYPTED_MEDIA_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash < 1 || slash === rest.length - 1)
        return null;
    const authSegment = rest.slice(0, slash);
    const objectId = rest.slice(slash + 1);
    if (!/^[A-Za-z0-9_-]+$/.test(authSegment))
        return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(objectId))
        return null;
    return `${ENCRYPTED_MEDIA_PREFIX}${authSegment}/${objectId}`;
}
function mediaPathOwnedByAuthUid(path, firebaseAuthUid) {
    const normalized = normalizeOwnedMediaPath(path);
    const owner = firebaseAuthUid.trim();
    if (!normalized || !owner)
        return false;
    return normalized.startsWith(`${ENCRYPTED_MEDIA_PREFIX}${owner}/`);
}
/**
 * Value stored on `users/{id}`. Firebase token URLs are reduced to an object path
 * so the token is not kept on the document. Other https URLs are kept.
 */
function profilePictureFieldsForStorage(profilePictureUrl, explicitPath, ownerFirebaseAuthUid) {
    const path = (explicitPath && mediaPathOwnedByAuthUid(explicitPath, ownerFirebaseAuthUid)
        ? normalizeOwnedMediaPath(explicitPath)
        : null) || storageObjectPathFromDownloadUrl(profilePictureUrl);
    if (path && mediaPathOwnedByAuthUid(path, ownerFirebaseAuthUid)) {
        return { profilePicturePath: path, profilePictureUrl: null };
    }
    if (/^https:\/\//i.test(profilePictureUrl) && !storageObjectPathFromDownloadUrl(profilePictureUrl)) {
        return { profilePictureUrl };
    }
    return {};
}
/** Short-lived read URL for a profile photo. Firebase token URLs are not returned. */
async function profilePictureUrlForClient(ownerFirebaseAuthUid, fields) {
    const storedPath = normalizeOwnedMediaPath(fields.profilePicturePath);
    const parsedPath = storageObjectPathFromDownloadUrl(fields.profilePictureUrl);
    const path = storedPath || parsedPath;
    if (path && ownerFirebaseAuthUid && mediaPathOwnedByAuthUid(path, ownerFirebaseAuthUid)) {
        try {
            const [url] = await admin.storage().bucket().file(path).getSignedUrl({
                version: "v4",
                action: "read",
                expires: Date.now() + SIGNED_URL_TTL_MS,
            });
            return url;
        }
        catch (err) {
            if (process.env.FUNCTIONS_EMULATOR === "true") {
                const legacy = String(fields.profilePictureUrl ?? "").trim();
                return /^https?:\/\//i.test(legacy) ? legacy : null;
            }
            console.error("profilePicture.sign_failed", err);
            return null;
        }
    }
    const raw = String(fields.profilePictureUrl ?? "").trim();
    if (!raw || storageObjectPathFromDownloadUrl(raw))
        return null;
    if (/^https:\/\//i.test(raw))
        return raw;
    return null;
}
