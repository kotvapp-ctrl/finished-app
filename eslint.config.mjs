import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'dev-dist/**/*',
      'node_modules/**/*',
      'android/**/*',
      'android-release/**/*',
      'apk-distribution/**/*',
      'APK_DOWNLOAD/**/*',
    ],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
