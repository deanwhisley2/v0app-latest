# CompreFace Setup (Production-style)

This project supports two selfie verification modes:

- **Primary (recommended):** CompreFace face verification
- **Fallback:** local selfie hash comparison

## 1) Start CompreFace stack

From repo root:

```bash
docker compose -f docker-compose.compreface.yml up -d
```

Services:

- `http://localhost:8002` - CompreFace UI
- `http://localhost:8000` - CompreFace API
- `http://localhost:8001` - Admin API

## 2) Create API key in CompreFace

1. Open CompreFace UI (`http://localhost:8002`)
2. Create an application for recognition/verification
3. Copy the **API key** for that app

## 3) Configure app env

Set on VPS/local app `.env.local`:

```env
COMPRE_FACE_API_URL=http://127.0.0.1:8000
COMPRE_FACE_API_KEY=YOUR_COMPREFACE_APP_KEY
COMPRE_FACE_VERIFY_THRESHOLD=0.82
```

If these are missing, the app automatically falls back to selfie-hash matching.

## 4) Restart app

```bash
npm run build
pm2 restart nexus-pro
```

## 5) How current integration works

- Registration:
  - selfie is required
  - quality checks run in browser
  - selfie hash stored in user metadata
  - best-effort CompreFace enrollment by user id
- Settings selfie update:
  - updates stored selfie + hash
  - best-effort CompreFace enrollment refresh
- Selfie recovery:
  - if CompreFace configured and both old/new selfie images available, verify with CompreFace
  - otherwise fallback to selfie hash distance

## 6) Security notes

- Enforce clear face capture (no hat/covering).
- Keep `COMPRE_FACE_VERIFY_THRESHOLD` high enough (0.8-0.9 typical).
- Keep stored selfie image access restricted to server/admin paths only.
