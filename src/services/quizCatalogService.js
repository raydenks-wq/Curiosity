const quizCatalog = [
  {
    id: 'ui-101',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Quiz UI Design Fundamentals',
    description: 'Evaluasi pemahaman konsep visual hierarchy, typography, dan layout dasar.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 8 * 60,
    questions: [
      {
        id: 'q1',
        title: 'Apa fungsi utama visual hierarchy pada halaman dashboard?',
        options: [
          'Membuat elemen tampak penuh warna',
          'Mengatur prioritas informasi agar mudah dipindai',
          'Memastikan semua teks berukuran sama',
          'Menghapus kebutuhan navigation',
        ],
        correctIndex: 1,
        explanation: 'Hierarchy membantu user menemukan informasi paling penting lebih cepat.',
      },
      {
        id: 'q2',
        title: 'Komponen mana yang paling tepat untuk menampilkan progres belajar?',
        options: ['Modal dialog', 'Progress bar', 'Tooltip', 'Dropdown'],
        correctIndex: 1,
        explanation: 'Progress bar memberikan konteks visual yang jelas terhadap progres.',
      },
      {
        id: 'q3',
        title: 'Tujuan utama penggunaan grid system adalah...',
        options: ['Dekorasi layout', 'Konsistensi alignment dan spacing', 'Mengurangi warna', 'Memperbesar teks'],
        correctIndex: 1,
        explanation: 'Grid memastikan komponen tersusun rapi dan konsisten antar layar.',
      },
    ],
  },
  {
    id: 'ui-101-m1',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Module Quiz: Foundations',
    description: 'Kuis cepat setelah modul Foundations selesai.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'm1-q1',
        title: 'Prinsip hierarchy yang paling penting untuk halaman kursus adalah...',
        options: ['Kontras ukuran', 'Semua elemen setara', 'Random alignment', 'Warna neon'],
        correctIndex: 0,
        explanation: 'Kontras ukuran dan visual weight membantu prioritas konten.',
      },
      {
        id: 'm1-q2',
        title: 'Tujuan typography pairing adalah...',
        options: ['Agar font terlihat unik', 'Meningkatkan readability', 'Menghemat warna', 'Menaikkan SEO'],
        correctIndex: 1,
        explanation: 'Typography pairing yang tepat memudahkan membaca konten.',
      },
    ],
  },
  {
    id: 'fe-101-m1',
    courseId: 'fe-101',
    moduleId: 'fe-101-m1',
    title: 'Module Quiz: HTML/CSS Core',
    description: 'Validasi dasar semantic HTML dan responsive layout.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'fe-q1',
        title: 'Tag semantic yang tepat untuk area navigasi adalah...',
        options: ['<div>', '<nav>', '<span>', '<article>'],
        correctIndex: 1,
        explanation: 'Tag <nav> digunakan untuk kumpulan link navigasi utama.',
      },
      {
        id: 'fe-q2',
        title: 'CSS Grid berguna untuk...',
        options: ['Menyimpan data', 'Menyusun layout 2D', 'Memanggil API', 'Membuat state global'],
        correctIndex: 1,
        explanation: 'Grid cocok untuk layout baris-kolom yang kompleks.',
      },
    ],
  },
  {
    id: 'pm-101-m1',
    courseId: 'pm-101',
    moduleId: 'pm-101-m1',
    title: 'Module Quiz: Discovery',
    description: 'Uji pemahaman problem framing dan prioritization matrix.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'pm-q1',
        title: 'Problem statement sebaiknya berfokus pada...',
        options: ['Fitur internal', 'Outcome pengguna', 'Pilihan warna produk', 'Brand slogan'],
        correctIndex: 1,
        explanation: 'Problem statement yang baik menekankan impact bagi user.',
      },
      {
        id: 'pm-q2',
        title: 'Prioritization matrix mengevaluasi...',
        options: ['Mood tim', 'Impact vs effort', 'Jumlah slide presentasi', 'Durasi meeting'],
        correctIndex: 1,
        explanation: 'Framework ini dipakai untuk menentukan prioritas implementasi fitur.',
      },
    ],
  },
]

const fallbackQuiz = {
  id: 'ui-101',
  courseId: 'ui-101',
  moduleId: 'ui-101-m1',
  title: 'Quiz UI Design Fundamentals',
  description: 'Kuis default untuk evaluasi pemahaman materi.',
  passingScore: 70,
  maxAttempts: 3,
  timeLimitSec: 6 * 60,
  questions: [],
}

export const quizCatalogService = {
  getQuizById(quizId) {
    return quizCatalog.find((quiz) => quiz.id === quizId) || null
  },

  getQuizForModule(courseId, moduleId) {
    return quizCatalog.find((quiz) => quiz.courseId === courseId && quiz.moduleId === moduleId) || null
  },

  getFallbackQuiz() {
    return fallbackQuiz
  },
}
