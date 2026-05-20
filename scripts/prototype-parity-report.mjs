import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputLines = [];

function readJson(relativePath) {
  const abs = path.join(root, relativePath);
  const raw = fs.readFileSync(abs, "utf8");
  return JSON.parse(raw);
}

function fileStatOrNull(relativePath) {
  const abs = path.join(root, relativePath);
  try {
    return fs.statSync(abs);
  } catch {
    return null;
  }
}

function pushSection(title) {
  outputLines.push("");
  outputLines.push(`## ${title}`);
}

outputLines.push("# Prototype Parity Report");
outputLines.push(`Generated: ${new Date().toISOString()}`);

const appJson = readJson("app.json");
const firebaseJson = readJson("firebase.json");
const firebaserc = readJson(".firebaserc");

const projectId = appJson?.expo?.extra?.firebase?.projectId ?? "missing";
const usingEmulators = Boolean(appJson?.expo?.extra?.useFirebaseEmulators);
const firebasercDefault = firebaserc?.projects?.default ?? "missing";

pushSection("Firebase Target");
outputLines.push(`- app.json projectId: ${projectId}`);
outputLines.push(`- app.json useFirebaseEmulators: ${usingEmulators}`);
outputLines.push(`- .firebaserc default: ${firebasercDefault}`);
if (firebasercDefault !== projectId) {
  outputLines.push(
    `- warning: .firebaserc default does not match app project. Use explicit --project ${projectId} in deploy commands.`
  );
}

pushSection("Backend Deploy Status");
outputLines.push(
  "- Firestore rules deploy: expected to succeed on Spark/Blaze."
);
outputLines.push(
  "- Functions deploy: requires Blaze plan because Cloud Build + Artifact Registry APIs must be enabled."
);
outputLines.push(`- Recommended deploy commands:`);
outputLines.push(`  - firebase deploy --project ${projectId} --only "firestore:rules"`);
outputLines.push(`  - firebase deploy --project ${projectId} --only "functions,firestore:rules"`);

pushSection("APK Artifact");
const apkPath = "android/app/build/outputs/apk/release/app-release.apk";
const apkStat = fileStatOrNull(apkPath);
if (!apkStat) {
  outputLines.push(`- missing: ${apkPath}`);
} else {
  outputLines.push(`- path: ${apkPath}`);
  outputLines.push(`- sizeBytes: ${apkStat.size}`);
  outputLines.push(`- lastModified: ${apkStat.mtime.toISOString()}`);
}

pushSection("Two-Phone Parity Gate");
outputLines.push("- Gate A: A and B can sign up/login with OTP + password.");
outputLines.push("- Gate B: A/B can add each other via NFC handshake.");
outputLines.push("- Gate C: A post appears on B; B private comment appears on A only.");
outputLines.push("- Gate D: A/B thread replies and reactions sync both phones.");
outputLines.push("- Gate E: Non-participant cannot see private thread.");

const reportDir = path.join(root, "reports");
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);
const reportPath = path.join(reportDir, `prototype-parity-${Date.now()}.md`);
fs.writeFileSync(reportPath, outputLines.join("\n") + "\n", "utf8");

console.log(outputLines.join("\n"));
console.log("");
console.log(`Report saved: ${reportPath}`);
