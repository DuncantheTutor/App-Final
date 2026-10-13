import { createHash, timingSafeEqual, X509Certificate } from "crypto";

export const GOOGLE_ATTESTATION_ROOT_0 = "-----BEGIN CERTIFICATE-----\nMIIFHDCCAwSgAwIBAgIJAPHBcqaZ6vUdMA0GCSqGSIb3DQEBCwUAMBsxGTAXBgNV\nBAUTEGY5MjAwOWU4NTNiNmIwNDUwHhcNMjIwMzIwMTgwNzQ4WhcNNDIwMzE1MTgw\nNzQ4WjAbMRkwFwYDVQQFExBmOTIwMDllODUzYjZiMDQ1MIICIjANBgkqhkiG9w0B\nAQEFAAOCAg8AMIICCgKCAgEAr7bHgiuxpwHsK7Qui8xUFmOr75gvMsd/dTEDDJdS\nSxtf6An7xyqpRR90PL2abxM1dEqlXnf2tqw1Ne4Xwl5jlRfdnJLmN0pTy/4lj4/7\ntv0Sk3iiKkypnEUtR6WfMgH0QZfKHM1+di+y9TFRtv6y//0rb+T+W8a9nsNL/ggj\nnar86461qO0rOs2cXjp3kOG1FEJ5MVmFmBGtnrKpa73XpXyTqRxB/M0n1n/W9nGq\nC4FSYa04T6N5RIZGBN2z2MT5IKGbFlbC8UrW0DxW7AYImQQcHtGl/m00QLVWutHQ\noVJYnFPlXTcHYvASLu+RhhsbDmxMgJJ0mcDpvsC4PjvB+TxywElgS70vE0XmLD+O\nJtvsBslHZvPBKCOdT0MS+tgSOIfga+z1Z1g7+DVagf7quvmag8jfPioyKvxnK/Eg\nsTUVi2ghzq8wm27ud/mIM7AY2qEORR8Go3TVB4HzWQgpZrt3i5MIlCaY504LzSRi\nigHCzAPlHws+W0rB5N+er5/2pJKnfBSDiCiFAVtCLOZ7gLiMm0jhO2B6tUXHI/+M\nRPjy02i59lINMRRev56GKtcd9qO/0kUJWdZTdA2XoS82ixPvZtXQpUpuL12ab+9E\naDK8Z4RHJYYfCT3Q5vNAXaiWQ+8PTWm2QgBR/bkwSWc+NpUFgNPN9PvQi8WEg5Um\nAGMCAwEAAaNjMGEwHQYDVR0OBBYEFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMB8GA1Ud\nIwQYMBaAFDZh4QB8iAUJUYtEbEf/GkzJ6k8SMA8GA1UdEwEB/wQFMAMBAf8wDgYD\nVR0PAQH/BAQDAgIEMA0GCSqGSIb3DQEBCwUAA4ICAQB8cMqTllHc8U+qCrOlg3H7\n174lmaCsbo/bJ0C17JEgMLb4kvrqsXZs01U3mB/qABg/1t5Pd5AORHARs1hhqGIC\nW/nKMav574f9rZN4PC2ZlufGXb7sIdJpGiO9ctRhiLuYuly10JccUZGEHpHSYM2G\ntkgYbZba6lsCPYAAP83cyDV+1aOkTf1RCp/lM0PKvmxYN10RYsK631jrleGdcdkx\noSK//mSQbgcWnmAEZrzHoF1/0gso1HZgIn0YLzVhLSA/iXCX4QT2h3J5z3znluKG\n1nv8NQdxei2DIIhASWfu804CA96cQKTTlaae2fweqXjdN1/v2nqOhngNyz1361mF\nmr4XmaKH/ItTwOe72NI9ZcwS1lVaCvsIkTDCEXdm9rCNPAY10iTunIHFXRh+7KPz\nlHGewCq/8TOohBRn0/NNfh7uRslOSZ/xKbN9tMBtw37Z8d2vvnXq/YWdsm1+JLVw\nn6yYD/yacNJBlwpddla8eaVMjsF6nBnIgQOf9zKSe06nSTqvgwUHosgOECZJZ1Eu\nzbH4yswbt02tKtKEFhx+v+OTge/06V+jGsqTWLsfrOCNLuA8H++z+pUENmpqnnHo\nvaI47gC+TNpkgYGkkBT6B/m/U01BuOBBTzhIlMEZq9qkDWuM2cA5kW5V3FJUcfHn\nw1IdYIg2Wxg7yHcQZemFQg==\n-----END CERTIFICATE-----";

export const GOOGLE_ATTESTATION_ROOT_1 = "-----BEGIN CERTIFICATE-----\nMIICIjCCAaigAwIBAgIRAISp0Cl7DrWK5/8OgN52BgUwCgYIKoZIzj0EAwMwUjEc\nMBoGA1UEAwwTS2V5IEF0dGVzdGF0aW9uIENBMTEQMA4GA1UECwwHQW5kcm9pZDET\nMBEGA1UECgwKR29vZ2xlIExMQzELMAkGA1UEBhMCVVMwHhcNMjUwNzE3MjIzMjE4\nWhcNMzUwNzE1MjIzMjE4WjBSMRwwGgYDVQQDDBNLZXkgQXR0ZXN0YXRpb24gQ0Ex\nMRAwDgYDVQQLDAdBbmRyb2lkMRMwEQYDVQQKDApHb29nbGUgTExDMQswCQYDVQQG\nEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABCPaI3FO3z5bBQo8cuiEas4HjqCt\nG/mLFfRT0MsIssPBEEU5Cfbt6sH5yOAxqEi5QagpU1yX4HwnGb7OtBYpDTB57uH5\nEczm34A5FNijV3s0/f0UPl7zbJcTx6xwqMIRq6NCMEAwDwYDVR0TAQH/BAUwAwEB\n/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFIyuyz7RkOb3NaBqQ5lZuA0QepA\nMAoGCCqGSM49BAMDA2gAMGUCMETfjPO/HwqReR2CS7p0ZWoD/LHs6hDi422opifH\nEUaYLxwGlT9SLdjkVpz0UUOR5wIxAIoGyxGKRHVTpqpGRFiJtQEOOTp/+s1GcxeY\nuR2zh/80lQyu9vAFCj6E4AXc+osmRg==\n-----END CERTIFICATE-----";

export const GOOGLE_ATTESTATION_ROOTS = [GOOGLE_ATTESTATION_ROOT_0, GOOGLE_ATTESTATION_ROOT_1];


/** Hardware key attestation extension. */
const ATTESTATION_OID = Buffer.from([
  0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0xd6, 0x79, 0x02, 0x01, 0x11,
]);

const ROOT_OF_TRUST_TAG = 704;
const ATTESTATION_APPLICATION_ID_TAG = 709;
const SECURITY_LEVEL_TRUSTED_ENVIRONMENT = 1;
const SECURITY_LEVEL_STRONG_BOX = 2;
const VERIFIED_BOOT_VERIFIED = 0;
/** Phone clocks are not the server clock. A fresh keystore certificate is dated "now" on the device. */
const ATTESTATION_CLOCK_SKEW_MS = 2 * 60 * 1000;

export const PAIRING_ATTESTATION_PACKAGES = [
  "com.duncanharper42.appv2build2",
  "com.duncanharper42.appv2build2.demo",
];

export const PAIRING_DEVICE_UNPROVEN =
  "This phone could not prove it is the genuine Erdos app.";
export const PAIRING_DEVICE_CHECK_UNCONFIGURED =
  "Pairing device check is not configured.";

type Tlv = {
  cls: number;
  tag: number;
  value: Buffer;
  end: number;
};

export type ParsedKeyAttestation = {
  attestationSecurityLevel: number;
  challenge: Buffer;
  packages: string[];
  signatureDigestsHex: string[];
  deviceLocked: boolean;
  verifiedBootState: number;
};

export type AndroidKeyAttestationOptions = {
  challenge: Buffer;
  now: Date;
  rootsPem: string[];
  allowedPackageNames: readonly string[];
  allowedCertSha256: readonly string[];
};

function readTlv(buf: Buffer, offset: number): Tlv {
  if (offset >= buf.length) throw new Error("Truncated attestation.");
  let p = offset;
  const first = buf[p++];
  const cls = first >> 6;
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let guard = 0;
    let byte = 0;
    do {
      if (p >= buf.length || guard++ > 4) throw new Error("Truncated attestation.");
      byte = buf[p++];
      tag = tag * 128 + (byte & 0x7f);
    } while (byte & 0x80);
  }
  if (p >= buf.length) throw new Error("Truncated attestation.");
  let len = buf[p++];
  if (len & 0x80) {
    const count = len & 0x7f;
    if (count === 0 || count > 3 || p + count > buf.length) throw new Error("Truncated attestation.");
    len = 0;
    for (let i = 0; i < count; i++) len = len * 256 + buf[p++];
  }
  const end = p + len;
  if (end > buf.length) throw new Error("Truncated attestation.");
  return { cls, tag, value: buf.subarray(p, end), end };
}

function readChildren(buf: Buffer): Tlv[] {
  const children: Tlv[] = [];
  let p = 0;
  while (p < buf.length) {
    const tlv = readTlv(buf, p);
    children.push(tlv);
    p = tlv.end;
  }
  return children;
}

function readUnsigned(buf: Buffer): number {
  let n = 0;
  for (const byte of buf) n = n * 256 + byte;
  return n;
}

function explicitInner(tlv: Tlv): Tlv {
  return readTlv(tlv.value, 0);
}

function findExplicit(children: Tlv[], tag: number): Tlv | null {
  const found = children.find((child) => child.cls === 2 && child.tag === tag);
  if (!found) return null;
  return explicitInner(found);
}

function parseApplicationId(der: Buffer): { packages: string[]; signatureDigestsHex: string[] } {
  const outer = readTlv(der, 0);
  const body = outer.tag === 16 && outer.cls === 0 ? outer.value : der;
  const [packagesSet, digestsSet] = readChildren(body);
  if (!packagesSet || !digestsSet) throw new Error("Invalid attestation application id.");
  const packages = readChildren(packagesSet.value).map((info) => {
    const [name] = readChildren(info.value);
    if (!name) throw new Error("Invalid attestation package.");
    return name.value.toString("utf8");
  });
  const signatureDigestsHex = readChildren(digestsSet.value).map((digest) =>
    digest.value.toString("hex")
  );
  return { packages, signatureDigestsHex };
}

function parseAuthorization(list: Tlv): {
  packages: string[];
  signatureDigestsHex: string[];
  deviceLocked: boolean | null;
  verifiedBootState: number | null;
} {
  const children = readChildren(list.value);
  const packages: string[] = [];
  const signatureDigestsHex: string[] = [];
  let deviceLocked: boolean | null = null;
  let verifiedBootState: number | null = null;
  const appId = findExplicit(children, ATTESTATION_APPLICATION_ID_TAG);
  if (appId && appId.tag === 4) {
    const parsed = parseApplicationId(appId.value);
    packages.push(...parsed.packages);
    signatureDigestsHex.push(...parsed.signatureDigestsHex);
  }
  const root = findExplicit(children, ROOT_OF_TRUST_TAG);
  if (root && root.tag === 16) {
    const fields = readChildren(root.value);
    const locked = fields[1];
    const boot = fields[2];
    if (locked) deviceLocked = locked.value.length > 0 && locked.value[0] !== 0;
    if (boot) verifiedBootState = readUnsigned(boot.value);
  }
  return { packages, signatureDigestsHex, deviceLocked, verifiedBootState };
}

export function parseKeyAttestationExtension(certDer: Buffer): ParsedKeyAttestation {
  const at = certDer.indexOf(ATTESTATION_OID);
  if (at < 0) throw new Error("Missing key attestation extension.");
  let p = at + ATTESTATION_OID.length;
  let next = readTlv(certDer, p);
  if (next.tag === 1 && next.cls === 0) {
    p = next.end;
    next = readTlv(certDer, p);
  }
  if (next.tag !== 4 || next.cls !== 0) throw new Error("Invalid key attestation extension.");
  const wrapped = readTlv(next.value, 0);
  if (wrapped.tag !== 16 || wrapped.cls !== 0) throw new Error("Invalid key attestation.");
  const description = readChildren(wrapped.value);
  if (description.length < 8) throw new Error("Invalid key attestation.");
  const securityLevel = description[1];
  const challenge = description[4];
  const software = parseAuthorization(description[6]);
  const tee = parseAuthorization(description[7]);
  if (tee.deviceLocked == null || tee.verifiedBootState == null) {
    throw new Error("Missing hardware boot state.");
  }
  return {
    attestationSecurityLevel: readUnsigned(securityLevel.value),
    challenge: Buffer.from(challenge.value),
    packages: [...software.packages, ...tee.packages],
    signatureDigestsHex: [...software.signatureDigestsHex, ...tee.signatureDigestsHex],
    deviceLocked: tee.deviceLocked,
    verifiedBootState: tee.verifiedBootState,
  };
}

function normalizeSha256(value: string): string {
  return value.replace(/[^0-9a-f]/gi, "").toLowerCase();
}

function verifyChain(ders: Buffer[], rootsPem: string[], now: Date): X509Certificate {
  if (ders.length === 0 || ders.length > 6) throw new Error("Invalid attestation chain.");
  const certs = ders.map((der) => new X509Certificate(der));
  const roots = rootsPem.map((pem) => new X509Certificate(pem));
  for (const cert of certs) {
    const from = new Date(cert.validFrom).getTime();
    const to = new Date(cert.validTo).getTime();
    const at = now.getTime();
    if (at + ATTESTATION_CLOCK_SKEW_MS < from || at - ATTESTATION_CLOCK_SKEW_MS > to) {
      throw new Error("Attestation certificate is expired.");
    }
  }
  const verifies = (cert: X509Certificate, key: X509Certificate["publicKey"]): boolean => {
    try {
      return cert.verify(key);
    } catch {
      return false;
    }
  };
  for (let i = 0; i < certs.length - 1; i++) {
    if (!verifies(certs[i], certs[i + 1].publicKey)) throw new Error("Attestation chain is invalid.");
  }
  const last = certs[certs.length - 1];
  const anchors = roots.some((root) => root.raw.equals(last.raw) || verifies(last, root.publicKey));
  if (!anchors) throw new Error("Attestation chain is not signed by a trusted root.");
  return certs[0];
}

export function verifyAndroidKeyAttestation(
  chainDer: Buffer[],
  options: AndroidKeyAttestationOptions
): void {
  const allowed = options.allowedCertSha256.map(normalizeSha256).filter((hex) => hex.length === 64);
  if (allowed.length === 0) throw new Error(PAIRING_DEVICE_CHECK_UNCONFIGURED);
  const leaf = verifyChain(chainDer, options.rootsPem, options.now);
  const parsed = parseKeyAttestationExtension(leaf.raw);
  if (
    parsed.attestationSecurityLevel !== SECURITY_LEVEL_TRUSTED_ENVIRONMENT &&
    parsed.attestationSecurityLevel !== SECURITY_LEVEL_STRONG_BOX
  ) {
    throw new Error(PAIRING_DEVICE_UNPROVEN);
  }
  if (
    !parsed.deviceLocked ||
    parsed.verifiedBootState !== VERIFIED_BOOT_VERIFIED
  ) {
    throw new Error(PAIRING_DEVICE_UNPROVEN);
  }
  if (
    parsed.challenge.length !== options.challenge.length ||
    !timingSafeEqual(parsed.challenge, options.challenge)
  ) {
    throw new Error(PAIRING_DEVICE_UNPROVEN);
  }
  const packages = new Set(options.allowedPackageNames);
  if (!parsed.packages.some((name) => packages.has(name))) {
    throw new Error(PAIRING_DEVICE_UNPROVEN);
  }
  const allowedSet = new Set(allowed);
  if (!parsed.signatureDigestsHex.some((hex) => allowedSet.has(normalizeSha256(hex)))) {
    throw new Error(PAIRING_DEVICE_UNPROVEN);
  }
}

export function pairingAttestationCertAllowlist(): string[] {
  return (process.env.PAIRING_ATTESTATION_CERT_SHA256 ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function verifyProductionPairingAttestation(chainDer: Buffer[], challenge: Buffer, now: Date): void {
  verifyAndroidKeyAttestation(chainDer, {
    challenge,
    now,
    rootsPem: GOOGLE_ATTESTATION_ROOTS,
    allowedPackageNames: PAIRING_ATTESTATION_PACKAGES,
    allowedCertSha256: pairingAttestationCertAllowlist(),
  });
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
