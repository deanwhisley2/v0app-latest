# Android APK release delivery (browser-first)

## Static artifacts (`public/releases/android/`)

| File | Purpose |
|------|---------|
| `release-info.json` | Version, build, download URL, notes — **fetched on user tap only** |
| `changelog.json` | Version history for tooling/docs |
| `nexus-pro-v1.apk` | Signed APK (publish separately; not in git) |

## Client rules

- No mount-time fetch of release metadata
- No polling or background APK checks on auth/dashboard load
- Download / version check / update check → **button tap only**
- Static install banner path disables legacy `useAndroidAppUpdate` interval polling

## Download validation (user tap only)

1. Fetch `release-info.json` (5-minute session cache)
2. Validate metadata: `published`, `sha256`, `size_mb`, version/build
3. Probe `/api/app/android-apk/validate` for on-disk APK + server checksum
4. Start download only when all checks pass — otherwise show **APK temporarily unavailable.**

## API compatibility

`/api/app/android-apk` serves the APK with correct headers when `nexus-pro-v1.apk` exists on disk.

`/api/app/android-release` remains for legacy callers; primary client path is static `release-info.json`.

## Flags

- `NEXUS_INSTALL_STATIC_BANNER = true`
- `NEXUS_LIGHTWEIGHT_ANDROID_INSTALL = false`
- `NEXUS_BROWSER_ONLY_LOCK = true`
