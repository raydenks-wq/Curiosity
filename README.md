# Curiosity LMS (Vue + Vite)

## Run

```bash
npm install
npm run dev
```

Backend API (opsional untuk mode `http`):

```bash
npm run server
```

Jalankan test backend (unit + integration):

```bash
npm run test:server
```

Dengan coverage report:

```bash
npm run test:server:coverage
```

Coverage gate aktif pada command coverage:

- statements >= `90`
- lines >= `90`
- functions >= `85`
- branches >= `75`

Backend hardening yang sudah aktif:

- `helmet` untuk secure headers
- `express-rate-limit` untuk endpoint login
- `bcrypt` (`bcryptjs`) untuk hash password
- validasi request payload dengan `zod`
- RBAC admin untuk endpoint `/users*`

## API Adapter

Project ini punya 2 adapter:

- `local` (default): data disimpan di `localStorage`
- `http`: panggil backend API via `fetch`

Gunakan `.env`:

```env
VITE_API_ADAPTER=local
VITE_API_BASE_URL=http://localhost:3000/api
```

Untuk mode backend:

1. set `VITE_API_ADAPTER=http`
2. set `VITE_API_BASE_URL=http://localhost:3000/api`
3. jalankan backend `npm run server`
4. backend menyediakan endpoint berikut:
   - `POST /auth/login`
   - `GET /auth/session`
   - `POST /auth/logout`
   - `GET /profile`
   - `PATCH /profile/account`
   - `PATCH /profile/preferences`
   - `POST /profile/password`
   - `POST /profile/reset`
   - `PUT /profile`
   - `GET /users`
   - `GET /users/permissions`
   - `PUT /users/permissions`
   - `POST /users`
   - `POST /users/invite`
   - `DELETE /users/:id`
   - `POST /users/bulk-delete`
   - `POST /users/bulk-status`
   - `POST /users/:id/toggle-status`
   - `POST /users/:id/reset-password`
   - `GET /audit-logs?limit=100`

Env backend yang didukung:

- `PORT` (default: `3000`)
- `JWT_SECRET` (wajib diganti untuk non-local)
- `JWT_EXPIRES_IN` (default: `12h`)
- `CORS_ORIGIN` (contoh: `http://localhost:5173`)
- `BCRYPT_ROUNDS` (default: `10`)

Catatan payload penting:

- `POST /profile/password`
  - body: `{ "currentPassword": "string", "newPassword": "string" }`
