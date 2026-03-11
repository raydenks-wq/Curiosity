# Course Management Tutorial (Simple Flow)

Dokumen ini fokus ke **alur paling sederhana** untuk membuat course sampai publish, tanpa harus menyentuh semua fitur advanced.

## Prinsip Pakai

- Isi dulu yang **wajib**.
- Fitur advanced dipakai belakangan saat course sudah stabil.
- Target awal: course bisa dibuka learner dan progres jalan.

## Mode 1: Quick Publish (Wajib)

Gunakan ini kalau mau cepat rilis.

### Step 1 - Buat Course Baru

1. Buka `Management > Manage Course`.
2. Klik **New Course**.
3. Isi section **1. Course Info**:
   - `Title`
   - `Slug`
   - `Description` (min. 30 karakter)
   - `Thumbnail URL`
   - `Category`, `Level`, `Language`.

### Step 2 - Susun Kurikulum

1. Masuk section **2. Curriculum Builder**.
2. Minimal 1 module, tiap module minimal 1 lesson.
3. Untuk tiap lesson:
   - `Lesson Title`
   - `Type`
   - `Duration`
   - `Content URL` (untuk video/article resource).
4. Pastikan **minimal 1 lesson** dicentang sebagai `Preview lesson`.

### Step 3 - (Opsional cepat) Tambah Asset

1. Section **3. Content & Assets**.
2. Tambah PDF/Link pendukung bila ada.

### Step 4 - Simpan

1. Klik **Save Course**.
2. Kalau ada error validasi, lihat panel checklist lalu lengkapi item yang gagal.

### Step 5 - Publish

1. Buka section **5. Publishing Workflow**.
2. Pastikan badge menunjukkan `Ready to Publish`.
3. Klik **Publish Now**.

Selesai. Course sudah live untuk learner.

## Mode 2: Scheduled Release (Wajib + Jadwal)

Kalau mau rilis di waktu tertentu:

1. Di section **5. Schedule Publish**, isi:
   - `Publish At`
   - `Unpublish At` (opsional)
2. Klik **Save Schedule**.
3. Status akan bergeser otomatis sesuai jadwal.

## Yang Boleh Di-skip Dulu

Saat awal, kamu boleh lewati ini:

- `Prerequisite & Access Rules` (section 4)
- `Approval Workflow`
- `Enrollment & Pricing`
- `Taxonomy, Localization`
- `Content Integrity Automation`
- `Operational Audit / Compliance`
- `Observability Dashboard`
- `Revision Diff Viewer`
- `Author Analytics`
- `Bulk Job Queue`

Fitur-fitur di atas dipakai setelah course pertama sudah berjalan.

## Kapan Pakai Fitur Advanced

- **Prerequisite**: saat course sudah berjenjang (Beginner -> Intermediate -> Advanced).
- **Approval Workflow**: saat ada editor + reviewer terpisah.
- **Localization**: saat butuh multi-bahasa.
- **Bulk Queue**: saat update banyak course sekaligus.
- **Observability/Audit**: saat butuh compliance dan tracking operasional.

## Checklist Final Sebelum Publish

Pastikan 8 ini aman:

1. Judul jelas.
2. Deskripsi layak (>=30 karakter).
3. Thumbnail valid.
4. Ada module.
5. Tiap module ada lesson.
6. Ada 1 preview lesson.
7. Durasi lesson valid (>0).
8. Tidak ada duplicate module/lesson ID.

## Troubleshooting Cepat

- Gagal publish: buka `Publish Checklist`, perbaiki item yang fail.
- Conflict version: refresh editor (karena ada perubahan dari user lain), lalu save ulang.
- Scope permission error: minta role/owner access ke admin.
- Queue job tidak jalan: klik `Run Queue Now` di `Bulk Job Queue`.

## Rekomendasi Operasional

Untuk tim kecil:

- Hari 1-3: pakai **Quick Publish** saja.
- Minggu 2: baru aktifkan prerequisite + approval.
- Minggu 3+: aktifkan observability, audit immutable, dan integrasi webhook/email.
