/* eslint-disable no-undef */
/**
 * withStripAsyncStorageMaven
 *
 * withDangerousMod runs BEFORE withProjectBuildGradle flushes to disk, so we
 * cannot use it to strip lines added by withProjectBuildGradle. Instead we
 * use withProjectBuildGradle here (this plugin is listed AFTER
 * expo-with-async-storage in app.json, so our mod reducer runs after theirs
 * in the sequential pipeline).
 */

const { createRequire } = require('module');
const _req = createRequire(require.resolve('expo/package.json'));
const { withProjectBuildGradle } = _req('@expo/config-plugins');

module.exports = (config) => {
  return withProjectBuildGradle(config, (mod) => {
    const before = mod.modResults.contents;

    mod.modResults.contents = before.replace(
      /[ \t]*maven\s*\{\s*url\s+(?:uri\()?project\(["']:react-native-async-storage_async-storage["']\)[^}]*\}[ \t]*\n?/g,
      ''
    );

    return mod;
  });
};
