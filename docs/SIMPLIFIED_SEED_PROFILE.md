# Simplified Seed Profile

Backend sekarang mendukung seed profile via env:

- `LMS_SEED_PROFILE=full` (default)
- `LMS_SEED_PROFILE=simple` atau `simplified`

## Perbedaan

### `full`
- Seed semua demo course bawaan
- Seed semua demo quiz bawaan
- Template certificate awal kosong

### `simple`
- Seed course lebih ringan (fokus subset internal)
- Seed quiz hanya yang relevan dengan course simple
- Seed 1 template certificate published default

## Kapan Dipakai

Pakai `simple` untuk deployment internal agar onboarding lebih cepat dan UI awal tidak terlalu ramai.

## Cara Terapkan di cPanel

1. Di Node.js App -> Environment Variables set:
   - `LMS_SEED_PROFILE=simple`
2. Reset DB agar seed baru terpakai:
   - hapus file DB lama (`server/data/db.json`) atau set `DB_PATH` ke file baru
   - restart app

Catatan:
- Seed profile hanya dipakai saat DB awal dibuat.
- Mengubah env tanpa reset DB tidak akan mengganti data lama secara otomatis.

