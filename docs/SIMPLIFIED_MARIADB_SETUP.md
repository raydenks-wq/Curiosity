# Simplified LMS + MariaDB Setup

Dokumen ini untuk mode **simplified** (fitur kompleks disederhanakan) dengan backend storage di **MariaDB**.

## 1) Frontend (.env)

```env
VITE_API_ADAPTER=http
VITE_API_BASE_URL=https://api.rks.my.id/api
VITE_SIMPLIFIED_MODE=true
VITE_FEATURE_USER_ADVANCED_ADMIN=false
VITE_FEATURE_QUIZ_BULK=false
VITE_FEATURE_COURSE_ENTERPRISE=false
VITE_FEATURE_CERTIFICATE_ADVANCED=false
```

## 2) Backend environment

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=<secret-kuat>
JWT_EXPIRES_IN=12h
CORS_ORIGIN=https://lms.rks.my.id
BCRYPT_ROUNDS=10

DB_PROVIDER=mariadb
DB_MARIA_HOST=127.0.0.1
DB_MARIA_PORT=3306
DB_MARIA_USER=<db_user>
DB_MARIA_PASSWORD=<db_password>
DB_MARIA_DATABASE=<db_name>
DB_MARIA_TABLE=lms_app_state
DB_MARIA_STATE_KEY=main
```

## 3) Verifikasi backend

Health check:

```bash
curl -i https://api.rks.my.id/api/health
```

Respon normal minimal:
- `HTTP 200`
- body berisi `"ok": true`
- `"provider": "mariadb"`

## 4) Catatan storage

- Server membuat table state otomatis jika belum ada.
- Seluruh data LMS disimpan sebagai state JSON tunggal (single row by `state_key`).
- Cocok untuk kebutuhan internal dan deployment cepat.

## 5) Dampak mode simplified

- Manage Certificate tetap aktif.
- Quiz bulk management disembunyikan.
- Course enterprise panels disembunyikan.
- User advanced admin panels disembunyikan.
- Certificate advanced flow (mis. export/filter lanjutan) disembunyikan.
