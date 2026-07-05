/* eslint-disable no-undef */
/**
 * Patches react-native-purchases* android/build.gradle after pnpm install.
 * Run via `postinstall` in package.json so patches survive dependency updates.
 *
 * Issues fixed:
 *  1. RC v9.x declares `buildscript { classpath 'AGP:8.x' }` in its library
 *     build.gradle, which conflicts with the root project AGP in Gradle 9.
 *  2. react-native-purchases-ui applies `com.facebook.react` Gradle plugin
 *     when newArchEnabled=true, but has no codegenConfig — crashing codegen.
 */

const fs = require('fs');
const path = require('path');

const RC_FILES = [
  'node_modules/react-native-purchases/android/build.gradle',
  'node_modules/react-native-purchases-ui/android/build.gradle',
];

let patched = 0;

for (const relPath of RC_FILES) {
  const filePath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-rc-gradle] SKIP (not found): ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Remove buildscript { ... } block (handles up to 3 levels of nested braces)
  if (content.includes('buildscript') && content.includes('classpath')) {
    const before = content;
    content = content.replace(
      /buildscript\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}\s*\n?/g,
      ''
    );
    if (content !== before) changed = true;
  }

  // 2. Remove `if (isNewArchitectureEnabled()) { apply plugin: "com.facebook.react" }` block
  if (content.includes('isNewArchitectureEnabled') && content.includes('com.facebook.react')) {
    const before = content;
    content = content.replace(
      /if\s*\(isNewArchitectureEnabled\(\)\)\s*\{[\s\S]*?apply plugin:\s*["']com\.facebook\.react["'][\s\S]*?\}\s*\n?/g,
      ''
    );
    if (content !== before) changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[patch-rc-gradle] PATCHED: ${relPath}`);
    patched++;
  } else {
    console.log(`[patch-rc-gradle] ALREADY CLEAN: ${relPath}`);
  }
}

console.log(`[patch-rc-gradle] Done. ${patched} file(s) patched.`);
