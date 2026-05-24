# Mobile production QA checklist

Use this before public Android/PWA announcement. Record PASS/FAIL per device.

## Devices (minimum matrix)

| Tier | Example devices |
|------|-----------------|
| Samsung mid | Galaxy A14, A24, A54 |
| Budget | Tecno Spark, Infinix Hot, Itel A-series |
| Flagship | Samsung S-series, Pixel |

## Test scenarios

### 1. Fresh install
- [ ] Visit login on Chrome Android → Install App prompt visible
- [ ] PWA install completes → opens standalone as **Nexus Pro**
- [ ] App icon correct on home screen
- [ ] First dashboard load < 5s on 3G throttled

### 2. Returning user
- [ ] Standalone opens to last session (auth persisted)
- [ ] Balances and notifications hydrate after reconnect
- [ ] Smart header reveals on scroll-up

### 3. Install / update
- [ ] APK publish script validates corrupt files (reject)
- [ ] Version endpoint returns `updateAvailable` when outdated
- [ ] Update banner → download → Open Downloads flow works
- [ ] No downgrade when installed > server version

### 4. Long-session stability
- [ ] 30+ min dashboard use without crash
- [ ] Tab switches (Home / Search / Alerts / Profile) without layout shift
- [ ] Memory stable (no runaway tab growth)

### 5. Weak internet
- [ ] Offline banner appears within 2s of disconnect
- [ ] Reconnected banner + bootstrap refetch
- [ ] `/offline` shell loads when navigate fails
- [ ] Auto-retry from offline page when online returns

### 6. Multi-device
- [ ] Same account on two phones — no session corruption
- [ ] Logout on one device does not silently break the other

### 7. Memory / performance
- [ ] Container, wallet, settings lazy-load without jank
- [ ] No excessive polling when tab backgrounded
- [ ] Low-end device: bottom nav + header responsive

### 8. Notifications
- [ ] In: permission prompt (once)
- [ ] Financial/trade alert shows native notification when app backgrounded
- [ ] In-app inbox still authoritative

### 9. Background resume
- [ ] App resume from recents → session refresh
- [ ] No white flash on resume (PWA shell)

### 10. Browser compatibility
- [ ] Chrome Android — full install + update
- [ ] Samsung Internet — install + manual fallback
- [ ] Firefox Android — PWA or APK path
- [ ] Opera — instant app / manual guidance

## Production verification URLs

- Health: `GET https://www.nexuspro.it.com/api/health`
- Release: `GET https://www.nexuspro.it.com/api/app/android-release`
- Version: `GET https://www.nexuspro.it.com/api/app/android-release/version?installed=20260524`

## Rollback

```bash
DEPLOY_REF=<prior-sha> bash scripts/deploy-vps-git-archive.sh
```
