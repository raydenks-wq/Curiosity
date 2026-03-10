# Course Player Production-Ready Gap List

Daftar ini merangkum kekurangan saat ini agar modul Course Player bisa naik ke level production-ready.

## Gaps

1. Konflik progres multi-device belum punya policy merge yang kuat.
2. Anti-cheat video masih basic; belum tahan edge case seek/refresh/playback-rate.
3. Belum ada dukungan native transcript file (`.vtt/.srt`) + parser + validasi.
4. Belum ada subtitle/caption renderer yang sinkron ke timeline video.
5. Continue Learning masih berbasis last touched; belum pakai prioritas cerdas (deadline, unlock, risiko tertinggal).
6. Bookmark/notes belum support tagging, pin, dan search lintas lesson/course.
7. Notes belum support autosave draft saat user offline/close tab tiba-tiba.
8. Sync queue belum punya telemetry detail per-item untuk debugging user-level.
9. Belum ada job retry background terjadwal (saat ini mengandalkan event online/load tertentu).
10. Belum ada mekanisme idempotency key untuk mencegah duplicate write di network flapping.
11. Belum ada versioning schema data progres/notes/transcript untuk migrasi aman.
12. API belum pakai pagination/filter untuk endpoint yang berpotensi membesar.
13. Belum ada rate-limit spesifik endpoint course-player yang sensitif abuse.
14. Belum ada audit trail detail untuk perubahan progres/notes per lesson.
15. Belum ada kontrol akses granular per course cohort/batch (di luar role umum).
16. Belum ada proteksi upload transcript/resource tingkat produksi (scan, quota, policy MIME ketat).
17. Belum ada enkripsi data sensitif at-rest di level aplikasi (jika dibutuhkan compliance).
18. Belum ada observability production lengkap (metrics, tracing, alerting, SLO).
19. Belum ada dashboard operasional untuk health sync failure/drop rate.
20. Belum ada performance budget dan uji beban (concurrency tinggi).
21. Belum ada caching strategy jelas untuk course detail/transcript/resource metadata.
22. Belum ada fallback media/CDN strategy untuk video di region dengan koneksi lambat.
23. Accessibility belum diaudit WCAG end-to-end (keyboard-only, screen reader flow, contrast formal).
24. Mobile QA belum lengkap untuk device matrix nyata (iOS Safari/Android Chrome berbagai ukuran).
25. E2E belum mencakup semua jalur kritis (multi-device, conflict merge, transcript import, failover).
26. Belum ada contract test API antar adapter local/http agar parity tetap terjaga.
27. Belum ada CI quality gate penuh (lint, type-check, test matrix, coverage threshold).
28. Belum ada backup/restore dan disaster recovery plan untuk data learning progress.
29. Belum ada kebijakan retensi data (notes/progress/log) untuk skala jangka panjang.
30. Belum ada readiness legal/compliance checklist (privacy policy data belajar, consent, DPA jika B2B).

## Catatan

- Fokus dokumen ini khusus area Course Player End-to-End.
- Daftar ini bisa dipakai sebagai baseline untuk roadmap 30-60-90 hari.
