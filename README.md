# REDIAL 5.0

Website mobile-first dengan Vite, vanilla JavaScript, Lenis, dan GSAP. Landing page di `/`, formulir di `/daftar/`, dan dashboard pendaftaran di `/admin/`.

## Lokal

Gunakan Node.js 22+, lalu `npm install` dan `npm run dev`. Jalankan `npm test` dan `npm run build` untuk verifikasi. API pendaftaran tersedia melalui Vite saat development dan Vercel Functions saat deployment.

## Supabase dan Vercel

1. Jalankan `supabase/redial.sql` di SQL Editor project Supabase yang dituju.
2. Isi `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` di `.env.local` untuk lokal dan Environment Variables di Vercel. Key hanya digunakan pada server.
3. Push repository ke GitHub dan import di Vercel. Build `npm run build`, output `dist`.

Pendaftaran dua langkah mewajibkan data peserta, nomor telepon, email, dan tangkapan layar QR TactLink maksimal 2 MB. Server memvalidasi format kontak dan memindai gambar QR sebelum menyimpan. Data dan berkas disimpan dalam satu baris dengan ID permintaan untuk mencegah duplikasi saat retry.

## Dashboard admin

1. Jika tabel sudah ada, jalankan kembali `supabase/redial.sql` sebelum deploy versi dengan kolom kontak. Skrip menambah kolom tanpa menghapus data lama. Kontak dan berkas dapat dilihat melalui **Detail**.
2. Buat akun email dan kata sandi di **Supabase → Authentication → Users**, lalu salin UUID akun tersebut.
3. Isi `REDIAL_ADMIN_USER_ID` dengan UUID tersebut dan `SUPABASE_PUBLISHABLE_KEY` dengan publishable key project. Isi variabel di `.env.local` dan Environment Variables di Vercel bersama `SUPABASE_URL` dan `SUPABASE_SECRET_KEY`. Restart dev server setelah mengubah `.env.local`.
4. Buka `/admin/` dan masuk memakai akun tadi. Dashboard membaca data yang tersimpan dari `/daftar/` dan memuat ulang setiap 30 detik saat aktif. Tombol **Muat ulang** menampilkan data terbaru kapan saja.

Hanya UUID yang ditetapkan yang bisa membaca, mengedit, atau menghapus pendaftaran serta mengunduh berkas. RLS aktif dan akses publik ke tabel ditutup. Sesi memakai cookie HttpOnly dan meminta login lagi setelah akses kedaluwarsa.

## Materi

`assets-original/` menyimpan salinan aset dari PPTX/DOCX. `public/assets/` berisi versi WebP untuk website. QRIS dipakai untuk penjualan dan donasi sesuai konfirmasi pemilik proyek.

Isi video dan partner final di `src/content.js`. Bagian video dan partner tampil setelah materinya diisi. Harga, paket bundling, dan jam kedatangan menunggu informasi final. Jam 11.00 dalam proposal adalah persiapan panitia, sementara rundown menyebut open gate 14.00. Website tidak mempublikasikan jam sementara tersebut.

Warna dan font mengikuti usulan diskusi. Animasi mengikuti prefers-reduced-motion. Pengujian perangkat fisik tetap perlu dilakukan pada HP target.
