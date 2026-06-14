# CRON Schedule — Signal Publishing

## Schedule (EAT / UTC+3)

| Session    | Signal Sent | Trading Window         | Crontab Expression (EAT) |
|-----------|-------------|------------------------|-------------------------|
| ☀️ Morning | 10:00 AM    | 1:00 PM → 5:30 PM      | `0 10 * * *`            |
| 🌙 Evening | 6:20 PM     | 12:10 AM → 8:40 AM+1   | `20 18 * * *`           |

## Crontab Entry (VPS)

Install with `crontab -e`:

```bash
# ── Nexus Pro Signal Publisher ────────────────────────────
CRON_SECRET="$(grep '^CRON_SECRET=' /opt/nexus-pro/.env.local | tail -1 | cut -d= -f2-)"

# Morning signal — 10:00 AM EAT (07:00 UTC)
0 7 * * * curl -sS -X POST "http://127.0.0.1:3000/api/cron/publish-daily-signal" -H "x-cron-secret: $CRON_SECRET" --max-time 120

# Evening signal — 6:20 PM EAT (15:20 UTC)
20 15 * * * curl -sS -X POST "http://127.0.0.1:3000/api/cron/publish-daily-signal" -H "x-cron-secret: $CRON_SECRET" --max-time 120
```

## Time Details

### ☀️ Morning Session
- **Signal published**: 10:00 AM EAT
- **Early booking opens**: 10:00 AM EAT (3 hours to book)
- **Trading starts**: 1:00 PM EAT
- **Trading ends**: 5:30 PM EAT (4.5 hours session)

### 🌙 Evening (Night) Session
- **Signal published**: 6:20 PM EAT (same day)
- **Early booking opens**: 6:20 PM EAT
- **Trading starts**: 12:10 AM EAT (next day midnight)
- **Trading ends**: 8:40 AM EAT (next day morning)

## Admin Manual Override

Admin Level 5 can manually create a signal via:
- **API**: `POST /api/admin/manual-signal`
- **Effect**: When an admin creates a signal, the auto-cron detects it and skips auto-generation.
- **Custom earnings %**: Admin can set a custom `customEarningPercent` to override the yield matrix.

## Crontab UTC Conversion

EAT = UTC + 3 hours:

| EAT Time    | UTC Time | Description         |
|------------|----------|---------------------|
| 10:00 AM   | 07:00    | Morning signal      |
| 6:20 PM    | 15:20    | Evening signal      |
| 1:00 PM    | 10:00    | Morning trade start |
| 5:30 PM    | 14:30    | Morning trade end   |
| 12:10 AM+1 | 21:10    | Evening trade start |
| 8:40 AM+1  | 05:40    | Evening trade end   |
