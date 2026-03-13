# Manage Certificate Refinement Plan

Tanggal update: 13 Maret 2026

## Tujuan
Membawa fitur `Manage Certificate` dari level UI lokal ke level production-ready end-to-end.

## Prioritas Refinement

### 1) Data Model dan Backend
- Pindahkan penyimpanan dari `localStorage` ke API/database.
- Tambahkan versioning template dan audit log perubahan.
- Validasi unik untuk `templateId` dan `certificateNo`.

### 2) Policy Engine
- Rule issuance lebih granular: completion, passing score, attendance, assignment status.
- Dukungan expiry policy per program/course.
- Re-issue policy (replace/duplicate) dan revoke reason wajib.

### 3) Generator Sertifikat
- Template editor visual (logo, signature, QR, layout, font).
- Render PDF final (A4 landscape/portrait) dengan preview akurat.
- QR verification link unik per sertifikat.

### 4) Verification Portal
- Halaman publik verifikasi sertifikat via QR/code.
- Status jelas: valid, revoked, expired, not found.
- Endpoint verifikasi dilengkapi rate limiting dan audit.

### 5) Workflow Operasional
- Bulk issue berdasarkan cohort/course completion.
- Queue/background job untuk issue massal.
- Retry + dead-letter queue untuk job gagal render/kirim.

### 6) UX Refinement
- Wizard pembuatan template: Basic -> Policy -> Design -> Publish.
- Empty/loading/error state yang lebih informatif.
- Search/filter issuance log dengan pagination server-side.

### 7) Security dan Governance
- Role permission terpisah: create template, publish, issue, revoke, verify.
- Immutable audit trail untuk issue/revoke.
- Proteksi asset signature/logo (akses file dan provenance).

### 8) Integrasi LMS
- Trigger otomatis saat user lulus course/quiz.
- Sinkron ke profile `My Certificates`.
- Notifikasi in-app/email saat sertifikat terbit atau di-revoke.

## Paket Implementasi Disarankan
Urutan implementasi agar cepat memberi nilai:

1. API-ready store + schema + migration dari local storage. ✅
2. PDF + QR generation (preview + final output). ✅
3. Verification page end-to-end (lookup + status + audit). ✅

## Progress Implementasi (13 Maret 2026)

### Selesai
- Adapter `certificates` ditambahkan di layer API (`local` + `http` contract).
- Schema store v2 + migrasi otomatis dari key legacy:
  - `curiosity:lms:certificate-templates:v1`
  - `curiosity:lms:certificate-issuance:v1`
- CRUD template sertifikat dipindahkan dari localStorage langsung ke `apiClient.certificates`.
- Issue/revoke issuance memakai service adapter + validasi status template.
- QR verification link ditambahkan pada issuance log.
- PDF siap print (print-friendly tab) ditambahkan dari issuance log.
- Halaman verifikasi publik ditambahkan:
  - route: `/verify/certificate/:code?`
  - status: `valid`, `revoked`, `expired`, `not found`

### Catatan
- PDF saat ini menggunakan print layout browser (cukup untuk MVP); bila perlu bisa di-upgrade ke renderer server-side.
- Endpoint HTTP sudah siap di adapter contract, implementasi backend route belum dikerjakan pada fase ini.
