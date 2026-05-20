/**
 * `react-native-ble-advertiser` ships compileSdkVersion 28 (or similar); modern AGP requires 30+
 * for Java 9+ sources. Idempotent: safe to run on every `npm install` and before every APK build.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const gradlePath = path.join(
  root,
  "node_modules",
  "react-native-ble-advertiser",
  "android",
  "build.gradle"
);

if (!fs.existsSync(gradlePath)) {
  process.exit(0);
}

let s = fs.readFileSync(gradlePath, "utf8");
const orig = s;

// Any compileSdk below 30 → 36 (covers 28, 29, or upstream changes).
s = s.replace(/compileSdkVersion\s+(\d+)/g, (full, n) => {
  const v = parseInt(String(n), 10);
  return Number.isFinite(v) && v < 30 ? "compileSdkVersion 36" : full;
});

// Align build tools / target when still on old defaults.
s = s.replace(/buildToolsVersion\s+"28\.0\.3"/g, 'buildToolsVersion "36.0.0"');
s = s.replace(/targetSdkVersion\s+28/g, "targetSdkVersion 36");

if (s !== orig) {
  fs.writeFileSync(gradlePath, s, "utf8");
  console.log("[patch-ble-advertiser-sdk] updated android/build.gradle (compileSdk >= 30)");
}
