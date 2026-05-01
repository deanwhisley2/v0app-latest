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

## 5) Configure GitHub Actions secrets

In GitHub -> Repo -> Settings -> Secrets and variables -> Actions, add:

- `SERVER_HOST`: your VPS IP or hostname
- `SERVER_USER`: SSH user (e.g., `ubuntu`)
- `SERVER_SSH_KEY`: private key for SSH access
- `SERVER_PORT`: usually `22`
- `APP_DIR`: `/var/www/nexus-pro`

## 6) Auto deploy

Push to `main`, and workflow `.github/workflows/deploy.yml` will:

1. SSH into server
2. Run `scripts/deploy.sh`
3. Pull latest code, install deps, build, restart PM2

## Notes

- Keep production secrets in server environment or `.env.local` on server.
- If you use API keys, never commit them to git.
- Ensure your firewall allows ports `80` and `443`.
