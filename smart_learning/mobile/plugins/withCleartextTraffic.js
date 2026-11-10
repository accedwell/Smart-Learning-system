// The Smart Learning backend on a school computer is plain http (e.g. http://192.168.1.20:4001).
// Android lets an installed app use plain http only when the app says so; this config plugin
// says so in the app's AndroidManifest when the APK is built (`npx expo prebuild`).
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application && mod.modResults.manifest.application[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
