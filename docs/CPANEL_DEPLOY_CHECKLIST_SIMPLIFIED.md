# cPanel Deploy Checklist (Branch `codex/simplified`)

Checklist ini untuk deploy LMS internal dengan frontend static + backend Node.js pada cPanel.

## 1. Struktur Folder

- Repo: `~/repos/lms`
- Frontend live: `~/public_html/lms`
- Backend app root: `~/repos/lms`
- Endpoint API: `https://api.rks.my.id/api`

## 2. Pull Kode Branch Simplified

```bash
cd ~/repos/lms
git fetch --all
git checkout codex/simplified
git pull origin codex/simplified
```

## 3. Build Frontend (HTTP Adapter)

Gunakan node venv bin agar `vite` tersedia di hosting.

```bash
cd ~/repos/lms
~/nodevenv/repos/lms/20/bin/npm install
VITE_API_ADAPTER=http VITE_API_BASE_URL=https://api.rks.my.id/api ~/nodevenv/repos/lms/20/bin/npm run build
```

## 4. Publish Frontend ke `public_html/lms`

```bash
rsync -av --delete ~/repos/lms/dist/ ~/public_html/lms/
```

Pastikan SPA fallback aktif via `.htaccess` di `public_html/lms`:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## 5. Konfigurasi Node.js App (API)

Node.js App (cPanel):
- Node version: `20.x`
- Application root: `repos/lms`
- Application URL: `api.rks.my.id`
- Startup file: `app.cjs`

Isi file `~/repos/lms/app.cjs`:

```js
(async () => {
  const mod = await import('./server/index.js')
  if (typeof mod.start === 'function') await mod.start()
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

## 6. Environment Variables (API)

Minimal:

- `NODE_ENV=production`
- `PORT=3000`
- `CORS_ORIGIN=https://lms.rks.my.id`
- `JWT_SECRET=<secret-acak-panjang>`
- `JWT_EXPIRES_IN=12h`
- `BCRYPT_ROUNDS=10`
- `LMS_SEED_PROFILE=simple`

## 7. Install Dependency API

Di panel Node.js app klik:
- `Run NPM Install`

Lalu:
- `Restart App`

## 8. Smoke Test

API:

```bash
curl -i https://api.rks.my.id/api/auth/session
```

Expected: `401` + JSON `Missing authorization token.` (artinya API hidup).

Frontend:
- buka `https://lms.rks.my.id`
- login demo (lihat bagian login quick access)
- cek menu: Dashboard, Course View, Quiz View, Management
- cek `Manage Certificate` tampil.

## 9. Setelah Update Kode

Urutan rutin:

1. `git pull origin codex/simplified`
2. build frontend + rsync `dist` ke `public_html/lms`
3. restart Node.js app
4. hard refresh browser (`Cmd+Shift+R`)

