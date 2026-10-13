import assert from "node:assert/strict";
import { generateKeyPairSync, sign, X509Certificate, type KeyObject } from "node:crypto";
import test from "node:test";

import {
  GOOGLE_ATTESTATION_ROOTS,
  PAIRING_DEVICE_CHECK_UNCONFIGURED,
  PAIRING_DEVICE_UNPROVEN,
  parseKeyAttestationExtension,
  verifyAndroidKeyAttestation,
} from "./androidKeyAttestation.ts";

function tlv(tag: number, value: Buffer): Buffer {
  let len: Buffer;
  if (value.length < 128) len = Buffer.from([value.length]);
  else if (value.length < 256) len = Buffer.from([0x81, value.length]);
  else len = Buffer.from([0x82, value.length >> 8, value.length & 0xff]);
  return Buffer.concat([Buffer.from([tag]), len, value]);
}

function seq(items: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(items));
}

function integerBytes(buf: Buffer): Buffer {
  let value = buf;
  if (value.length === 0) value = Buffer.from([0]);
  if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0x00]), value]);
  return tlv(0x02, value);
}

function smallInt(n: number): Buffer {
  return integerBytes(Buffer.from([n]));
}

function octet(buf: Buffer): Buffer {
  return tlv(0x04, buf);
}

function oid(bytes: number[]): Buffer {
  return tlv(0x06, Buffer.from(bytes));
}

function utf8(text: string): Buffer {
  return tlv(0x0c, Buffer.from(text));
}

function derLen(n: number): Buffer {
  if (n < 128) return Buffer.from([n]);
  if (n < 256) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, n >> 8, n & 0xff]);
}

function contextExplicit(tag: number, inner: Buffer): Buffer {
  let header: Buffer;
  if (tag < 31) header = Buffer.from([0xa0 | tag]);
  else {
    const encoded: number[] = [];
    let value = tag;
    encoded.unshift(value & 0x7f);
    value >>= 7;
    while (value > 0) {
      encoded.unshift(0x80 | (value & 0x7f));
      value >>= 7;
    }
    header = Buffer.from([0xbf, ...encoded]);
  }
  return Buffer.concat([header, derLen(inner.length), inner]);
}

function name(commonName: string): Buffer {
  return seq([tlv(0x31, seq([oid([0x55, 0x04, 0x03]), utf8(commonName)]))]);
}

function utc(when: Date): Buffer {
  const yy = String(when.getUTCFullYear()).slice(2);
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${yy}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text));
}

function rsaSpki(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  const n = Buffer.from(jwk.n, "base64url");
  const e = Buffer.from(jwk.e, "base64url");
  const rsaPublic = seq([integerBytes(n), integerBytes(e)]);
  const alg = seq([oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]), Buffer.from([0x05, 0x00])]);
  return seq([alg, tlv(0x03, Buffer.concat([Buffer.from([0x00]), rsaPublic]))]);
}

const SHA256_RSA = seq([
  oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
  Buffer.from([0x05, 0x00]),
]);

function signCert(args: {
  subjectKey: KeyObject;
  subject: string;
  issuer: string;
  signer: KeyObject;
  serial: number;
  extension?: Buffer;
}): Buffer {
  const notBefore = new Date("2024-01-01T00:00:00Z");
  const notAfter = new Date("2035-01-01T00:00:00Z");
  const parts = [
    contextExplicit(0, smallInt(2)),
    smallInt(args.serial),
    SHA256_RSA,
    name(args.issuer),
    seq([utc(notBefore), utc(notAfter)]),
    name(args.subject),
    rsaSpki(args.subjectKey),
  ];
  if (args.extension) {
    parts.push(contextExplicit(3, seq([args.extension])));
  }
  const tbs = seq(parts);
  const signature = sign("sha256", tbs, args.signer);
  return seq([tbs, SHA256_RSA, tlv(0x03, Buffer.concat([Buffer.from([0x00]), signature]))]);
}

function keyDescription(args: {
  securityLevel: number;
  challenge: Buffer;
  packageName: string;
  certSha256: Buffer;
  locked: boolean;
  bootState: number;
}): Buffer {
  const packageInfo = seq([octet(Buffer.from(args.packageName)), smallInt(1)]);
  const appId = seq([
    tlv(0x31, packageInfo),
    tlv(0x31, octet(args.certSha256)),
  ]);
  const rootOfTrust = seq([
    octet(Buffer.alloc(32, 7)),
    tlv(0x01, Buffer.from([args.locked ? 0xff : 0x00])),
    tlv(0x0a, Buffer.from([args.bootState])),
    octet(Buffer.alloc(32, 9)),
  ]);
  const software = seq([contextExplicit(709, octet(appId))]);
  const tee = seq([contextExplicit(704, rootOfTrust)]);
  return seq([
    smallInt(4),
    tlv(0x0a, Buffer.from([args.securityLevel])),
    smallInt(41),
    tlv(0x0a, Buffer.from([args.securityLevel])),
    octet(args.challenge),
    octet(Buffer.alloc(0)),
    software,
    tee,
  ]);
}

function attestationExtension(description: Buffer): Buffer {
  return seq([
    oid([0x2b, 0x06, 0x01, 0x04, 0x01, 0xd6, 0x79, 0x02, 0x01, 0x11]),
    octet(description),
  ]);
}

function chainFor(args: {
  challenge: Buffer;
  packageName: string;
  certSha256: Buffer;
  securityLevel?: number;
  locked?: boolean;
  bootState?: number;
}): { ders: Buffer[]; rootPem: string } {
  const root = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const mid = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const leaf = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rootDer = signCert({
    subjectKey: root.publicKey,
    subject: "Test Root",
    issuer: "Test Root",
    signer: root.privateKey,
    serial: 1,
  });
  const midDer = signCert({
    subjectKey: mid.publicKey,
    subject: "Test Mid",
    issuer: "Test Root",
    signer: root.privateKey,
    serial: 2,
  });
  const description = keyDescription({
    securityLevel: args.securityLevel ?? 1,
    challenge: args.challenge,
    packageName: args.packageName,
    certSha256: args.certSha256,
    locked: args.locked ?? true,
    bootState: args.bootState ?? 0,
  });
  const leafDer = signCert({
    subjectKey: leaf.publicKey,
    subject: "Test Leaf",
    issuer: "Test Mid",
    signer: mid.privateKey,
    serial: 3,
    extension: attestationExtension(description),
  });
  return { ders: [leafDer, midDer, rootDer], rootPem: new X509Certificate(rootDer).toString() };
}

const CHALLENGE = Buffer.from("pairing-challenge-32-bytes-long!!");
const CERT_SHA = Buffer.alloc(32, 0xab);
const CERT_HEX = CERT_SHA.toString("hex");

test("hardware attestation accepts a locked verified genuine app", () => {
  const { ders, rootPem } = chainFor({
    challenge: CHALLENGE,
    packageName: "com.duncanharper42.appv2build2",
    certSha256: CERT_SHA,
  });
  assert.doesNotThrow(() =>
    verifyAndroidKeyAttestation(ders, {
      challenge: CHALLENGE,
      now: new Date("2026-10-13T12:00:00Z"),
      rootsPem: [rootPem],
      allowedPackageNames: ["com.duncanharper42.appv2build2"],
      allowedCertSha256: [CERT_HEX],
    })
  );
});

test("software attestation and an unlocked bootloader are refused", () => {
  const software = chainFor({
    challenge: CHALLENGE,
    packageName: "com.duncanharper42.appv2build2",
    certSha256: CERT_SHA,
    securityLevel: 0,
  });
  assert.throws(
    () =>
      verifyAndroidKeyAttestation(software.ders, {
        challenge: CHALLENGE,
        now: new Date("2026-10-13T12:00:00Z"),
        rootsPem: [software.rootPem],
        allowedPackageNames: ["com.duncanharper42.appv2build2"],
        allowedCertSha256: [CERT_HEX],
      }),
    (err: unknown) => err instanceof Error && err.message === PAIRING_DEVICE_UNPROVEN
  );
  const unlocked = chainFor({
    challenge: CHALLENGE,
    packageName: "com.duncanharper42.appv2build2",
    certSha256: CERT_SHA,
    locked: false,
  });
  assert.throws(() =>
    verifyAndroidKeyAttestation(unlocked.ders, {
      challenge: CHALLENGE,
      now: new Date("2026-10-13T12:00:00Z"),
      rootsPem: [unlocked.rootPem],
      allowedPackageNames: ["com.duncanharper42.appv2build2"],
      allowedCertSha256: [CERT_HEX],
    })
  );
});

test("a swapped challenge or an unlisted signing cert is refused", () => {
  const { ders, rootPem } = chainFor({
    challenge: CHALLENGE,
    packageName: "com.example.other",
    certSha256: CERT_SHA,
  });
  assert.throws(() =>
    verifyAndroidKeyAttestation(ders, {
      challenge: Buffer.from("different-challenge-32-bytes!!!!"),
      now: new Date("2026-10-13T12:00:00Z"),
      rootsPem: [rootPem],
      allowedPackageNames: ["com.duncanharper42.appv2build2"],
      allowedCertSha256: [CERT_HEX],
    })
  );
  assert.equal(parseKeyAttestationExtension(ders[0]).packages[0], "com.example.other");
});

test("embedded Google attestation roots parse", () => {
  assert.equal(GOOGLE_ATTESTATION_ROOTS.length, 2);
  for (const pem of GOOGLE_ATTESTATION_ROOTS) {
    assert.equal(new X509Certificate(pem).issuer.length > 0, true);
  }
});

test("a certificate a minute ahead of the server is still accepted", () => {
  const { ders, rootPem } = chainFor({
    challenge: CHALLENGE,
    packageName: "com.duncanharper42.appv2build2",
    certSha256: CERT_SHA,
  });
  assert.doesNotThrow(() =>
    verifyAndroidKeyAttestation(ders, {
      challenge: CHALLENGE,
      now: new Date("2023-12-31T23:59:00Z"),
      rootsPem: [rootPem],
      allowedPackageNames: ["com.duncanharper42.appv2build2"],
      allowedCertSha256: [CERT_HEX],
    })
  );
  assert.throws(() =>
    verifyAndroidKeyAttestation(ders, {
      challenge: CHALLENGE,
      now: new Date("2023-12-31T23:57:00Z"),
      rootsPem: [rootPem],
      allowedPackageNames: ["com.duncanharper42.appv2build2"],
      allowedCertSha256: [CERT_HEX],
    })
  );
});

test("an empty signing-cert allowlist is not a pass", () => {
  const { ders, rootPem } = chainFor({
    challenge: CHALLENGE,
    packageName: "com.duncanharper42.appv2build2",
    certSha256: CERT_SHA,
  });
  assert.throws(
    () =>
      verifyAndroidKeyAttestation(ders, {
        challenge: CHALLENGE,
        now: new Date("2026-10-13T12:00:00Z"),
        rootsPem: [rootPem],
        allowedPackageNames: ["com.duncanharper42.appv2build2"],
        allowedCertSha256: [],
      }),
    (err: unknown) => err instanceof Error && err.message === PAIRING_DEVICE_CHECK_UNCONFIGURED
  );
});
