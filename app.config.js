// Extends app.json with settings that come from environment variables.
// The Google Maps key draws the native map on Android; search and routes read
// the same key at runtime (EXPO_PUBLIC_GOOGLE_MAPS_KEY). Without it the app
// falls back to the free OpenStreetMap map and services.
module.exports = ({ config }) => {
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
  if (!googleMapsKey) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: googleMapsKey }]],
  };
};
