/**
 * Runs exactly one Gradle APK task so stray npm args (e.g. `npm run apk:release -- from …`)
 * never reach gradlew as bogus task names like "from".
 *
 * Optional third argv `demo`: after a successful build, also copies to `app-demo-{variant}.apk`
 * (same binary) for installs you label “demo / fake-friends QA” — not done by default.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
/** Only `debug` selects debug APK; any other argv[2] (or none) → release. Ignores npm pass-through noise. */
const task = process.argv[2]?.toLowerCase() === "debug" ? "assembleDebug" : "assembleRelease";
const copyDemoNamedApk = process.argv
  .slice(3)
  .some((a) => String(a).toLowerCase() === "demo");
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

const patch = spawnSync(process.execPath, [path.join(__dirname, "patch-ble-advertiser-sdk.mjs")], {
  cwd: projectRoot,
  stdio: "inherit",
});
if ((patch.status ?? 1) !== 0) {
  process.exit(patch.status ?? 1);
}

const r = spawnSync(gradle, [task], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // Main app (MainApp) unless the build explicitly requests demo QA (`apk:debug demo`).
    EXPO_PUBLIC_APP_VARIANT: copyDemoNamedApk ? "demo" : "release",
  },
});
if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);

const variant = task === "assembleDebug" ? "debug" : "release";
const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", variant, `app-${variant}.apk`);
const demoApkPath = path.join(androidDir, "app", "build", "outputs", "apk", variant, `app-demo-${variant}.apk`);
if (copyDemoNamedApk && existsSync(apkPath)) {
  copyFileSync(apkPath, demoApkPath);
  console.log(`Copied ${variant} APK to ${path.relative(projectRoot, demoApkPath)}`);
}
process.exit(0);
