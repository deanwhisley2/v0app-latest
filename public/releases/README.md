# Signed Nexus Pro APK

Production downloads use **`GET /api/app/android-apk`** (correct MIME + Content-Disposition).

## Deploy APK to VPS

1. Build and sign release APK locally.
2. Copy to server:
   ```bash
   scp nexus-pro.apk root@173.214.164.179:/opt/nexus-pro/public/releases/nexus-pro.apk
   ```
   Or set `ANDROID_APK_PATH=/path/to/nexus-pro.apk` in `.env.local` on the host.
3. Update `public/android-release.json`:
   - `sha256` — SHA-256 of the APK file
   - `sizeBytes` — file size in bytes
   - `version` / `versionCode` — match build
4. Redeploy or restart PM2 (no code change required if file path is used).

Verify:
```bash
curl -I https://www.nexuspro.it.com/api/app/android-apk
# Expect: 200, Content-Type: application/vnd.android.package-archive, X-Nexus-Apk-Available: 1
```
