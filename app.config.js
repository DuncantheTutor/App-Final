/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require("./app.json");
  const expo = { ...appJson.expo };
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ?? "";

  if (expo.extra?.firebase) {
    expo.extra = {
      ...expo.extra,
      firebase: {
        ...expo.extra.firebase,
        apiKey,
      },
    };
  }

  if (easProjectId) {
    expo.extra = {
      ...(expo.extra ?? {}),
      eas: {
        ...((expo.extra ?? {}).eas ?? {}),
        projectId: easProjectId,
      },
    };
  }

  return expo;
};
