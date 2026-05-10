# Nexus Pro Domain + Server Setup

This guide sets up a fully automated flow:

`You -> Cursor code changes -> GitHub push -> VPS deploy -> Domain updates`

## 1) Prepare VPS (Ubuntu)

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2) Clone app on server

```bash
sudo mkdir -p /var/www/nexus-pro
sudo chown -R $USER:$USER /var/www/nexus-pro
cd /var/www/nexus-pro
git clone <YOUR_REPO_URL> .
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs --only nexus-pro --update-env
pm2 save
pm2 startup
```

## 3) Configure domain + Nginx

1. In DNS provider, create an `A` record:
   - Host: `nexus` (or `@`)
   - Value: `<YOUR_SERVER_PUBLIC_IP>`
2. On server:

```bash
sudo cp /var/www/nexus-pro/docs/nginx-nexus-pro.conf /etc/nginx/sites-available/nexus-pro.conf
sudo nano /etc/nginx/sites-available/nexus-pro.conf
# replace nexus.yourdomain.com with your real domain
sudo ln -s /etc/nginx/sites-available/nexus-pro.conf /etc/nginx/sites-enabled/nexus-pro.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 4) Enable HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nexus.yourdomain.com
```

## 5) Why your phone does not match Vercel

Pushing to `main` updates **Vercel** automatically. Your **domain** (e.g. `nexuspro.it.com`) usually points at the **VPS** (nginx → PM2 → `next start`). That server only gets new code when someone runs **`scripts/deploy.sh`** on the VPS (or you add CI below).

## 6) Deploy on the VPS (required for domain / phone)

SSH in as your server user (e.g. `vpsuser`, `ubuntu`, `root`), then:

```bash
cd /var/www/nexus          # use your real clone path — same as VPS_APP_DIR below
git fetch origin && git checkout main && git pull origin main
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

`deploy.sh` runs `npm ci`, `npm run build`, and restarts PM2 app **`nexus`** per `ecosystem.config.js`. You need `.env.local` on the server (see `scripts/deploy.sh`).

## 7) Optional: GitHub Action to deploy the VPS on every push

1. In the repo, create **`.github/workflows/deploy-vps.yml`** — copy from **`docs/snippets/github-actions-deploy-vps.yml`**.  
   - Easiest: GitHub → **Add file** → paste (avoids PAT **`workflow`** scope).  
   - Or use a Personal Access Token with **`workflow`** scope when pushing workflow files from the CLI.
2. Repo → **Settings** → **Secrets and variables** → **Actions**, add:

- `VPS_HOST` — VPS hostname or IP  
- `VPS_USER` — SSH user (`vpsuser`, `ubuntu`, …)  
- `VPS_SSH_KEY` — private key (full PEM)  
- `VPS_APP_DIR` — e.g. `/var/www/nexus` (must match the clone on the server)

The VPS clone must be able to `git pull` this repo (deploy key or HTTPS credential).

## Notes

- Keep production secrets in server environment or `.env.local` on server.
- If you use API keys, never commit them to git.
- Ensure your firewall allows ports `80` and `443`.
