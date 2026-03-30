# DapoerMuda POS

Aplikasi kasir mobile berbasis HTML, CSS, dan JavaScript dengan backend Node bawaan untuk sinkronisasi data antar-device.

## Fitur

- Login admin dan kasir
- Transaksi penjualan
- Manajemen stok dan restok
- Riwayat transaksi
- Rekap pemasukan mingguan dan bulanan
- PWA installable untuk Android
- Wrapper Android native dengan Capacitor
- Backend API bawaan untuk login, transaksi, stok, restok, dan riwayat terpusat
- Penyimpanan data server-side di `server/data/app.db` (SQLite)

## Menjalankan Web + Backend

1. Jalankan `npm install` jika dependensi belum terpasang.
2. Jalankan `npm start`
3. Buka `http://localhost:8787`

Server akan:
- menyiapkan aset web ke folder `www/`
- menjalankan backend di port `8787`
- menyimpan data terpusat di `server/data/app.db`

## Konfigurasi Backend

Owner aplikasi cukup mengatur sekali saat deploy:

- `app-config.js`
  Isi `apiBaseUrl` dengan URL backend Anda, misalnya `https://domain-anda.com/api`
- Environment variable opsional:
  `HOST`, `PORT`, `DATA_FILE`, `CORS_ORIGIN`, `SESSION_TTL_MS`
  `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME`
  `CASHIER_LOGIN`, `CASHIER_PASSWORD`, `CASHIER_DISPLAY_NAME`

Jika aplikasi dibuka dari origin backend yang sama, web akan otomatis memakai `/api` tanpa perlu isi manual.

## Instal di HP

Untuk PWA:

1. Upload project ke hosting HTTPS yang juga menjalankan backend.
2. Pastikan `app-config.js` mengarah ke backend yang benar jika domain API berbeda.
3. Buka link aplikasi di Chrome Android.
4. Pilih install atau tambahkan ke layar utama.

## Build APK Android

Project ini sekarang juga sudah punya folder `android/` untuk build APK native.

APK debug hasil build ada di:

`android/app/build/outputs/apk/debug/app-debug.apk`

Sebelum build APK final, pastikan `app-config.js` sudah berisi URL backend publik agar semua device Android memakai data yang sama.
