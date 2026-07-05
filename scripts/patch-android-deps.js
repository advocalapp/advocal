/* eslint-disable no-undef */
/**
 * postinstall patch: fix async-storage android/build.gradle for Gradle 9 / AGP 8+
 *
 * async-storage 2.x ships two blocks at the top of its android/build.gradle that
 * Gradle 9 rejects at configuration time:
 *
 *   1. configurations { compileClasspath }
 *      AGP 8 role-locks `compileClasspath` as resolvable-only; re-declaring it
 *      causes "Configuration role cannot be changed" in Gradle 9.
 *
 *   2. buildscript { … }
 *      Subproject buildscript blocks with classpath dependencies are forbidden
 *      in Gradle 9 — only the root project may use buildscript.
 *
 * This script runs automatically after every `pnpm install` (postinstall hook)
 * and strips both blocks so Gradle can evaluate the module without errors.
 */

const fs = require('fs');
const path = require('path');

const TARGET = path.join(
  __dirname,
  '../node_modules/@react-native-async-storage/async-storage/android/build.gradle'
);

if (!fs.existsSync(TARGET)) {
  console.log('[patch-android-deps] async-storage build.gradle not found — skipping');
  process.exit(0);
}

const original = fs.readFileSync(TARGET, 'utf8');

// Strategy: the file should start with `apply plugin: 'com.android.library'`.
// Everything before that line is the Gradle 9-incompatible preamble
// (configurations block + subproject buildscript block). Slice it away.
const ANCHOR = "apply plugin: 'com.android.library'";
const anchorIdx = original.indexOf(ANCHOR);

if (anchorIdx === 0) {
  console.log('[patch-android-deps] async-storage build.gradle already patched — skipping');
  process.exit(0);
}

if (anchorIdx < 0) {
  console.warn('[patch-android-deps] WARNING: anchor not found — build.gradle unchanged');
  process.exit(0);
}

const patched = original.slice(anchorIdx);

fs.writeFileSync(TARGET, patched);
console.log('[patch-android-deps] ✓ Patched async-storage android/build.gradle for Gradle 9 compatibility');
