// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Night Pool — 기본 글꼴 SUIT 는 components/Text 래퍼가 깐다.
    files: ["app/**", "components/**", "contexts/**"],
    ignores: ["components/Text.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "react-native",
          importNames: ["Text", "TextInput"],
          message: "기본 글꼴(SUIT)을 위해 components/Text 의 Text·TextInput 을 쓰세요.",
        }],
      }],
    },
  },
]);
