#!/usr/bin/env bash
# Assemble unsigned debug APK (app-debug.apk) for sideload QA.
# Requires: JDK 17+, Android SDK (ANDROID_HOME), Gradle via android/ wrapper.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

bash scripts/cap-prepare-out.sh
npx cap sync android

cd android
chmod +x gradlew
./gradlew assembleDebug

APK="${ROOT}/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "${APK}" ]]; then
  ls -lh "${APK}"
  echo "==> Debug APK: ${APK}"
else
  echo "ERROR: APK not found at ${APK}"
  exit 1
fi
