// Sentry's Metro config gives each bundle a debug id, so crash reports from a build or an
// over-the-air update map back to the source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

module.exports = getSentryExpoConfig(__dirname)
