/* eslint-disable no-undef */
/**
 * Custom Expo Config Plugin — Android build settings
 *
 * Applies:
 *  1. MultiDex enabled (required for apps with >64k methods)
 *  2. Universal APK build — ABI splits disabled so a single APK supports
 *     arm64-v8a, armeabi-v7a (real-device architectures only; x86/x86_64 dropped)
 *  3. All hardware <uses-feature> entries set to required="false"
 *     so the app is available on devices without optional hardware
 *  4. android.hardware.touchscreen explicitly optional (prevents implicit required=true)
 *  5. R8 minification enabled for release builds (code shrinking via ProGuard rules)
 *  6. Resource shrinking enabled for release builds (removes unused drawables/strings)
 *  7. reactNativeArchitectures restricted to arm64-v8a,armeabi-v7a (real devices only)
 *     — drops x86/x86_64 (emulator-only ABIs) saving ~30–40 MB per APK
 *
 * NOTE: minSdkVersion / targetSdkVersion / compileSdkVersion are already
 * managed by Expo's own prebuild via rootProject.ext variables — do NOT
 * override them here as that causes build.gradle corruption.
 */

// pnpm does not hoist @expo/config-plugins to the workspace root.
// Resolve it via createRequire from the `expo` package, which lists it as a
// direct dependency and therefore has it in its own node_modules subtree.
// oxlint-disable-next-line no-undef
const { createRequire } = require('module');
// oxlint-disable-next-line no-undef
const _req = createRequire(require.resolve('expo/package.json'));
const { withAppBuildGradle, withProjectBuildGradle, withAndroidManifest, withDangerousMod, withGradleProperties } = _req('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── 0: SYNC versionCode + versionName into gradle.properties ─────────────────
// Reads the authoritative values from app.json (via Expo config) and writes them
// as APP_VERSION_CODE and APP_VERSION_NAME into gradle.properties.
// build.gradle reads these via findProperty() — no file parsing, no imports,
// 100% Gradle 9 configuration-cache safe.
const withVersionProperties = (config) => {
  return withGradleProperties(config, (mod) => {
    const versionCode = String(config.android?.versionCode ?? 1);
    const versionName = String(config.version ?? '1.0.0');

    const setOrAdd = (key, value) => {
      const idx = mod.modResults.findIndex((i) => i.type === 'property' && i.key === key);
      if (idx >= 0) {
        mod.modResults[idx] = { type: 'property', key, value };
      } else {
        mod.modResults.push({ type: 'property', key, value });
      }
    };

    setOrAdd('APP_VERSION_CODE', versionCode);
    setOrAdd('APP_VERSION_NAME', versionName);

    // ── APK size optimizations ────────────────────────────────────────────────
    // R8 (code minification + dead code removal) — release builds only.
    // Reduces JS-interop glue, reflection stubs, and unused class definitions.
    setOrAdd('android.enableMinifyInReleaseBuilds', 'true');

    // Resource shrinking — strips unused drawables, layouts, strings, etc.
    // Only takes effect when minifyEnabled=true (R8 must run first for analysis).
    setOrAdd('android.enableShrinkResourcesInReleaseBuilds', 'true');

    // Restrict to real-device ABIs only. x86 and x86_64 are emulator-only;
    // including them adds ~30–40 MB of extra native .so libraries per APK.
    // EAS Build cloud machines are real hardware — this is always safe.
    setOrAdd('reactNativeArchitectures', 'arm64-v8a,armeabi-v7a');

    return mod;
  });
};

// ── 1: build.gradle — MultiDex + disable ABI splits (universal APK) ──────────
const withAndroidGradleConfig = (config) => {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;

    // ── MultiDex: inject after "defaultConfig {" if not already present ──
    if (!gradle.includes('multiDexEnabled')) {
      gradle = gradle.replace(
        /(defaultConfig\s*\{)/,
        '$1\n        multiDexEnabled true'
      );
    } else {
      gradle = gradle.replace(/multiDexEnabled\s+\w+/, 'multiDexEnabled true');
    }

    // ── Universal APK: disable ABI splits so one APK runs on all architectures ──
    // This fixes "App not compatible" errors on real devices (arm64-v8a / armeabi-v7a).
    const splitsBlock = `
    splits {
        abi {
            enable false
            universalApk true
        }
    }`;
    if (!gradle.includes('splits {')) {
      // Insert before the last closing brace of the android { } block
      gradle = gradle.replace(
        /(android\s*\{[\s\S]*)(buildTypes\s*\{)/,
        `$1${splitsBlock}\n    $2`
      );
    }

    mod.modResults.contents = gradle;
    return mod;
  });
};

// ── 5: AndroidManifest.xml — all hardware features optional ──────────────────
const HARDWARE_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.flash',
  'android.hardware.camera.front',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.bluetooth',
  'android.hardware.bluetooth_le',
  'android.hardware.nfc',
  'android.hardware.sensor.accelerometer',
  'android.hardware.sensor.gyroscope',
  'android.hardware.sensor.barometer',
  'android.hardware.sensor.compass',
  'android.hardware.microphone',
  'android.hardware.telephony',
  'android.hardware.wifi',
  'android.hardware.touchscreen',
  'android.hardware.touchscreen.multitouch',
];

const withAndroidHardwareOptional = (config) => {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Ensure uses-feature array exists
    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }

    const existing = manifest['uses-feature'];

    // Build a set of already-declared feature names
    const declared = new Set(
      existing.map((f) => f.$?.['android:name']).filter(Boolean)
    );

    // Mark existing entries as required=false
    manifest['uses-feature'] = existing.map((feature) => ({
      ...feature,
      $: { ...feature.$, 'android:required': 'false' },
    }));

    // Add any missing hardware features as optional
    for (const name of HARDWARE_FEATURES) {
      if (!declared.has(name)) {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }

    return mod;
  });
};

// ── 2: Patch problematic third-party build.gradle files ──────────────────────
//
// Several React Native community modules ship build.gradle files that are
// incompatible with Gradle 9 + Android Gradle Plugin 8.x:
//
//  (A) react-native-purchases / react-native-purchases-ui
//      • Nested `buildscript {}` with classpath declarations → duplicate classpath
//        entries; in Gradle 9 subproject buildscripts are deprecated.
//      • `if (isNewArchitectureEnabled()) { apply plugin: "com.facebook.react" }`
//        using the OLD conditional block → broken with React Native 0.83.
//
//  (B) @react-native-async-storage/async-storage 2.x
//      • `configurations { compileClasspath }` at the TOP of the file, before
//        `apply plugin: 'com.android.library'`.  AGP 8+ auto-creates
//        `compileClasspath` when it applies the library plugin; a prior manual
//        declaration throws:
//          "Cannot add a configuration with name 'compileClasspath' as a
//           configuration with that name already exists."
//        This crash happens at Gradle CONFIGURATION time — before any source
//        compilation — and kills every build.
//      • Nested `buildscript {}` with Kotlin + KSP classpath entries that
//        conflict with the root project's AGP / Kotlin version resolution.
//
// These patches are applied via withDangerousMod so they run at expo-prebuild
// time, AFTER all other plugins have set up the mod pipeline, on the live files
// inside node_modules.
const withPatchRCGradle = (config) => {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      // Use mod.modRequest.projectRoot (the actual project root on the build server)
      // instead of process.cwd() which may point to a different directory depending
      // on how Medo invokes the expo prebuild command.
      const projectRoot = mod.modRequest.projectRoot;
      const nm = path.join(projectRoot, 'node_modules');

      const filesToPatch = [
        // react-native-purchases — strip buildscript{} + new-arch conditional
        {
          filePath: path.join(nm, 'react-native-purchases/android/build.gradle'),
          stripBuildscript: true,
          stripNewArchConditional: true,
          stripConfigurationsCompileClasspath: false,
        },
        {
          filePath: path.join(nm, 'react-native-purchases-ui/android/build.gradle'),
          stripBuildscript: true,
          stripNewArchConditional: true,
          stripConfigurationsCompileClasspath: false,
        },
        // async-storage 2.x — strip configurations{compileClasspath} + buildscript{}
        {
          filePath: path.join(nm, '@react-native-async-storage/async-storage/android/build.gradle'),
          stripBuildscript: true,
          stripNewArchConditional: false,
          stripConfigurationsCompileClasspath: true,
        },
      ];

      for (const { filePath, stripBuildscript, stripNewArchConditional, stripConfigurationsCompileClasspath } of filesToPatch) {
        try {
          if (!fs.existsSync(filePath)) continue;
          let content = fs.readFileSync(filePath, 'utf8');
          let changed = false;

          // Strip `configurations { compileClasspath }` block.
          // AGP 8+ creates this automatically; a prior manual declaration crashes
          // with "configuration with that name already exists".
          if (stripConfigurationsCompileClasspath && /configurations\s*\{[^}]*compileClasspath[^}]*\}/.test(content)) {
            content = content.replace(/configurations\s*\{[^}]*compileClasspath[^}]*\}\s*\n?/g, '');
            changed = true;
          }

          // Strip `buildscript { ... }` block (nested braces, up to 3 levels deep).
          // Subproject buildscripts with classpath entries cause duplicate-classpath
          // issues in Gradle 9 and are deprecated for library modules.
          if (stripBuildscript && content.includes('buildscript') && content.includes('classpath')) {
            content = content.replace(/buildscript\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}\s*\n?/g, '');
            changed = true;
          }

          // Strip `if (isNewArchitectureEnabled()) { apply plugin: "com.facebook.react" }`.
          // This old-style conditional is superseded by the react-native Gradle plugin
          // in RN 0.83 and causes duplicate-plugin errors when New Architecture is on.
          if (stripNewArchConditional && content.includes('isNewArchitectureEnabled') && content.includes('com.facebook.react')) {
            content = content.replace(
              /if\s*\(isNewArchitectureEnabled\(\)\)\s*\{[\s\S]*?apply plugin:\s*["']com\.facebook\.react["'][\s\S]*?\}\s*\n?/g,
              ''
            );
            changed = true;
          }

          if (changed) fs.writeFileSync(filePath, content, 'utf8');
        } catch (_) { /* file may not exist in all environments */ }
      }
      return mod;
    },
  ]);
};

// ── 3: Ensure New Architecture is ENABLED (required by react-native-reanimated 4.x) ─
// Reanimated 4.x throws a GradleException at preBuild if newArchEnabled=false.
// RN 0.83 + Expo SDK 55 fully support New Architecture.
const withNewArchEnabled = (config) => {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.map((item) => {
      if (item.type === 'property' && item.key === 'newArchEnabled') {
        return { ...item, value: 'true' };
      }
      return item;
    });
    // Ensure the key exists even if not present
    if (!mod.modResults.some((i) => i.key === 'newArchEnabled')) {
      mod.modResults.push({ type: 'property', key: 'newArchEnabled', value: 'true' });
    }
    return mod;
  });
};

// ── 2b: Root build.gradle — upgrade google-services for Gradle 9 compat ───────
const withGoogleServicesUpgrade = (config) => {
  return withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /com\.google\.gms:google-services:4\.4\.1/g,
      'com.google.gms:google-services:4.4.2'
    );
    return mod;
  });
};

// ── 2c: Suppress async-storage maven injection ────────────────────────────────
// @react-native-async-storage/expo-with-async-storage ships withAndroidAsyncStorage,
// which injects into android/build.gradle during expo prebuild:
//   maven { url uri(project(":react-native-async-storage_async-storage").projectDir.toString() + "/local_repo") }
//
// async-storage 2.x ships NO local_repo directory. In Gradle 9, any maven { url }
// declaration pointing at a non-existent path causes a hard error at configuration
// time — BEFORE any source compilation — killing every single build.
//
// withAndroidAsyncStorage skips injection when the file already contains the
// substring "async-storage/local_repo". We exploit this skip-check by inserting
// a suppression comment before that plugin runs.
//
// Execution order guarantee:
//   Our plugin is index 0 in app.json → withProjectBuildGradle mods from our
//   plugin are appended to the reducer array BEFORE withAndroidAsyncStorage from
//   expo-with-async-storage (index 1). Reducers run in append order, so our
//   suppression comment is written first, and withAndroidAsyncStorage sees it
//   and does nothing.
const withSuppressAsyncStorageMavenInjection = (config) => {
  return withProjectBuildGradle(config, (mod) => {
    const MARKER = '// async-storage/local_repo — injection suppressed by withAndroidBuildConfig';
    if (!mod.modResults.contents.includes('async-storage/local_repo')) {
      mod.modResults.contents = MARKER + '\n' + mod.modResults.contents;
    }
    return mod;
  });
};

// ── 6: Last-resort safety net — strip any stale async-storage maven reference ─
// withSuppressAsyncStorageMavenInjection (above) prevents the injection during
// expo prebuild. This dangerous mod runs AFTER all projectBuildGradle mods as a
// belt-and-suspenders measure: if any other plugin manages to inject the unsafe
// project() reference, we strip it here before Gradle ever sees it.
const withFixAsyncStorageMaven = (config) => {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const buildGradlePath = path.resolve(
        mod.modRequest.projectRoot,
        'android',
        'build.gradle'
      );
      if (!fs.existsSync(buildGradlePath)) return mod;

      let contents = fs.readFileSync(buildGradlePath, 'utf8');

      // No 'g' flag — only one such line is ever injected, and replace()
      // without g replaces the first match then stops (simpler + no lastIndex issue).
      const unsafePattern =
        /[ \t]*maven\s*\{\s*url\s+(?:uri\()?project\(["']:react-native-async-storage_async-storage["']\)[^}]*\}[ \t]*/;

      if (unsafePattern.test(contents)) {
        contents = contents.replace(unsafePattern, `
    // Stripped by withAndroidBuildConfig — async-storage 2.x has no local_repo dir.
    // Gradle 9 rejects maven repos pointing at non-existent paths.
`);
        fs.writeFileSync(buildGradlePath, contents, 'utf8');
      }

      return mod;
    },
  ]);
};

// ── 7: Pin Gradle wrapper to 8.13 ─────────────────────────────────────────────
// expo prebuild (via RN 0.83.2 template) generates gradle-wrapper.properties
// pointing at Gradle 9.0.0. Gradle 9 dropped the IBM_SEMERU enum from the
// foojay-resolver plugin used by expo-modules-autolinking, which causes a hard
// crash at configuration time:
//   NoSuchFieldError: IBM_SEMERU (foojay DistributionsKt)
// Gradle 8.13 is the correct version for Expo SDK 55 + AGP 8.12.
const withGradleWrapper = (config) => {
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const wrapperPath = path.resolve(
        mod.modRequest.projectRoot,
        'android',
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );
      if (!fs.existsSync(wrapperPath)) return mod;
      let contents = fs.readFileSync(wrapperPath, 'utf8');
      // Replace any Gradle version with 8.13
      contents = contents.replace(
        /distributionUrl=.*gradle-.*-bin\.zip/,
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip'
      );
      fs.writeFileSync(wrapperPath, contents, 'utf8');
      return mod;
    },
  ]);
};

// ── Compose and export ────────────────────────────────────────────────────────
/* global module */
// oxlint-disable-next-line no-undef
module.exports = (config) => {
  config = withVersionProperties(config);
  config = withAndroidGradleConfig(config);
  config = withPatchRCGradle(config);
  config = withNewArchEnabled(config);
  config = withGoogleServicesUpgrade(config);
  config = withAndroidHardwareOptional(config);
  config = withGradleWrapper(config); // ← must run after android/ is created
  return config;
};
