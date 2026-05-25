# Mobile production QA checklist

Use before mobile production sign-off. Record PASS/FAIL per device. Browser-first (no APK install layer).

## Devices (minimum matrix)

| Tier | Example devices |
|------|-----------------|
| Samsung mid | Galaxy A14, A24, A54 |
| Budget | Tecno Spark, Infinix Hot, Itel A-series |
| Flagship | Samsung S-series, Pixel |

## Test scenarios

### 1. Fresh session (browser)
- [ ] Login / register complete without geo hard-block (Kenya mobile data OK with warning if needed)
- [ ] First dashboard load < 5s on 3G throttled
- [ ] No compositor corruption on A05-class (flat mode when `nexus-mobile-low-gpu` present)

### 2. Returning user
- [ ] Auth persists across refresh
- [ ] Balances and notifications hydrate after reconnect
- [ ] Smart header reveals on scroll-up

### 3. Long-session stability
- [ ] 30+ min dashboard use without crash
- [ ] Tab switches (Home / Search / Alerts / Profile) without layout shift
- [ ] Memory stable (no runaway tab growth)

### 4. Weak internet
- [ ] Offline banner appears within 2s of disconnect
- [ ] Reconnected banner + bootstrap refetch
- [ ] `/offline` shell loads when navigate fails
- [ ] Auto-retry from offline page when online returns

### 5. Multi-device
- [ ] Same account on two phones — no session corruption
- [ ] Logout on one device does not silently break the other

### 6. Memory / performance
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
- [ ] Chrome Android — auth, dashboard, scroll, no compositor corruption
- [ ] Samsung Internet — same
- [ ] Firefox Android — same
- [ ] Opera — same

## Production verification URLs

- Health: `GET https://www.nexuspro.it.com/api/health`

## Rollback

```bash
DEPLOY_REF=<prior-sha> bash scripts/deploy-vps-git-archive.sh
```
