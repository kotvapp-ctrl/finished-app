#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for tool in java npx unzip sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: Required tool '$tool' is not installed on this machine." >&2
    exit 1
  fi
done

echo "1/4 Building web bundle..."
npm run build

echo "2/4 Copying web assets into Capacitor Android..."
npx cap copy android

echo "3/4 Compiling installable debug APK and Google Play release AAB..."
chmod +x android/gradlew
(
  cd android
  ./gradlew :app:assembleDebug :app:bundleRelease --no-daemon
)

APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
AAB_SRC="android/app/build/outputs/bundle/release/app-release.aab"

echo "4/4 Verifying and copying outputs into android-release/..."
unzip -tq "$APK_SRC"
unzip -tq "$AAB_SRC"

mkdir -p android-release
cp "$APK_SRC" android-release/app-debug.apk
cp "$AAB_SRC" android-release/app-release.aab
(cd android-release && sha256sum app-debug.apk > app-debug.apk.sha256)
(cd android-release && sha256sum app-release.aab > app-release.aab.sha256)

echo "Done:"
echo "  Mobile APK : $ROOT_DIR/android-release/app-debug.apk"
echo "  Play AAB   : $ROOT_DIR/android-release/app-release.aab"
