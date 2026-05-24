# Android release artifacts

Place the signed APK at topublish:

```
public/releases/android/nexus-pro-v1.apk
```

Metadata (static, no auth):

- `release-info.json` — version, download URL, release notes
- `changelog.json` — version history

The app fetches `release-info.json` **only after the user taps Download** — never on page load.

Canonical download route with correct MIME headers: `/api/app/android-apk` (reads APK from this folder when present).
