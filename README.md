# Curiosity LMS (Vue + Vite)

Panduan alur pembuatan course versi sederhana:

- [`docs/course-management-tutorial.md`](docs/course-management-tutorial.md)

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

Jalankan E2E utama:

```bash
npm run test:e2e
```

Jalankan E2E Course Management (observability + revision diff):

```bash
npm run test:e2e:course-management
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
   - `GET /courses`
   - `GET /courses/:id`
   - `POST /courses/:id/lessons/:lessonId/select`
   - `POST /courses/:id/lessons/:lessonId/complete`
   - `GET /courses/:id/lessons/:lessonId/discussions`
   - `POST /courses/:id/lessons/:lessonId/discussions`
   - `PATCH /courses/:id/lessons/:lessonId/discussions/:discussionId`
   - `DELETE /courses/:id/lessons/:lessonId/discussions/:discussionId`
   - `GET /notifications?limit=30`
   - `GET /notifications/channels`
   - `PUT /notifications/channels`
   - `POST /notifications/test-delivery`
   - `GET /notifications/delivery-logs?limit=100`
   - `GET /audit-logs?limit=100`
   - `GET /audit-logs/immutable?limit=100`
   - `GET /audit-logs/immutable/verify`
   - `GET /course-management/jobs?limit=100`
   - `GET /course-management/jobs/worker-lease`
   - `POST /course-management/jobs`
   - `POST /course-management/jobs/process-due`
   - `POST /course-management/jobs/:id/run`
   - `DELETE /course-management/jobs/:id`
   - `GET /course-management/jobs/dlq?limit=100`
   - `POST /course-management/jobs/dlq/:id/redrive`
   - `GET /course-management/:id/compliance-export`
   - `POST /notifications/webhook/ingest`

Env backend yang didukung:

- `PORT` (default: `3000`)
- `JWT_SECRET` (wajib diganti untuk non-local)
- `JWT_EXPIRES_IN` (default: `12h`)
- `CORS_ORIGIN` (contoh: `http://localhost:5173`)
- `BCRYPT_ROUNDS` (default: `10`)
- `NOTIFICATION_WEBHOOK_SECRET` (opsional, untuk HMAC signature header `X-Curiosity-Signature`)
- `COURSE_JOB_RETRY_BASE_MS` (default: `5000`)
- `COURSE_JOB_LEASE_TTL_MS` (default: `12000`)
- `WEBHOOK_SIGNATURE_TOLERANCE_SEC` (default: `300`)
- `EMAIL_PROVIDER_MODE` (`simulated` atau `webhook`, default: `simulated`)
- `EMAIL_PROVIDER_WEBHOOK_URL` (wajib jika `EMAIL_PROVIDER_MODE=webhook`)
- `EMAIL_PROVIDER_API_KEY` (opsional, bearer token ke provider email webhook)
- `EMAIL_PROVIDER_TIMEOUT_MS` (default: `5000`)

Catatan payload penting:

- `POST /profile/password`
  - body: `{ "currentPassword": "string", "newPassword": "string" }`
- Course player mendukung deep-link lesson:
  - contoh: `/courses/ui-101?lesson=ui-101-l2`
- Reply discussion per lesson:
  - `POST /courses/:id/lessons/:lessonId/discussions`
  - body minimal: `{ "message": "text" }`
  - body reply: `{ "message": "text", "parentId": "disc-..." }`
  - mention user: gunakan token seperti `@raka` atau `@indra` di `message`

Quiz Engine (frontend V1):

- randomisasi urutan soal dan opsi jawaban per attempt
- timer per quiz dengan auto-submit saat waktu habis
- auto-grade + passing score
- retake policy dengan batas attempt
- feedback per soal (jawaban user, jawaban benar, dan penjelasan)
