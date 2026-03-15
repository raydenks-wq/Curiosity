# Simplified Mode - Feature Takedown List

Tujuan: menyederhanakan LMS untuk kebutuhan internal perusahaan agar implementasi MariaDB lebih ringan dan maintenance lebih mudah.

## Sudah Ditakedown (di branch `codex/simplified`)

1. User Management Advanced Admin Panels
- Status: `disabled`
- Dampak: panel `Permission Matrix` dan `Audit Log` disembunyikan dari halaman User Management pada mode simplified.

## Backlog Takedown (disarankan berikutnya)

1. Course Management Queue + DLQ + Worker Lease
- Status: `planned`
- Alasan: kompleksitas tinggi, tidak wajib untuk internal.

2. Course Revision History + Restore + Diff
- Status: `planned`
- Alasan: menambah beban penyimpanan dan logic restore.

3. Compliance Export Bundle
- Status: `planned`
- Alasan: bukan kebutuhan inti operasional internal.

4. Immutable Audit Chain + Verify Endpoint
- Status: `planned`
- Alasan: overkill untuk scope internal non-regulated.

5. Telemetry Events Custom
- Status: `planned`
- Alasan: bisa diganti server log standar.

6. Notification Advanced Channel/Delivery Log/Test
- Status: `planned`
- Alasan: integrasi eksternal belum prioritas.

7. Advanced Certificate Flow (verify public, revoke workflow detail, bulk issue, governance lock)
- Status: `planned`
- Alasan: pertahankan menu Manage Certificate, namun alur enterprise lanjutan bisa disederhanakan.

## Runtime Flag yang dipakai

Mode ini dikontrol dari frontend env:

- `VITE_SIMPLIFIED_MODE=true` (default di branch ini)
- `VITE_FEATURE_CERTIFICATES=true` (default tetap aktif)
- `VITE_FEATURE_USER_ADVANCED_ADMIN=false` (default mengikuti simplified mode)

Jika ingin mengaktifkan kembali fitur tertentu:

1. set `VITE_SIMPLIFIED_MODE=false`, atau
2. override per fitur:
   - `VITE_FEATURE_CERTIFICATES=true`
   - `VITE_FEATURE_USER_ADVANCED_ADMIN=true`
