// The app shows the same text as the website, in all 11 languages, by reading the web app's
// translation files (frontend/src/i18n) instead of keeping a copy of them here.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../frontend/src/i18n')];

module.exports = config;
