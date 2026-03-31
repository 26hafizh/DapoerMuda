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

- `DAPOERMUDA_API_BASE_URL`
  Dipakai saat build asset web atau APK.
  Gunakan `same-origin` jika web dan API ada di domain yang sama.
  Gunakan `https://domain-anda.com` jika backend ada di domain lain.
- Environment variable opsional:
  `HOST`, `PORT`, `DATA_FILE`, `CORS_ORIGIN`, `SESSION_TTL_MS`
  `DAPOERMUDA_API_BASE_URL`, `DAPOERMUDA_REQUEST_TIMEOUT_MS`
  `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `ADMIN_DISPLAY_NAME`
  `CASHIER_LOGIN`, `CASHIER_PASSWORD`, `CASHIER_DISPLAY_NAME`

Secara default jika nilainya kosong, aplikasi berjalan di mode lokal/demo.
Backend hanya aktif jika Anda mengisi `same-origin` atau URL backend publik yang benar.

## Deploy Railway

Project ini sekarang sudah siap untuk dideploy sebagai satu service Node yang melayani web dan API sekaligus.

1. Buat project baru di Railway dari repo GitHub ini.
2. Railway akan membaca [railway.toml](/c:/Users/hfz/Downloads/cihuy/railway.toml) dan [Dockerfile](/c:/Users/hfz/Downloads/cihuy/Dockerfile).
3. Tambahkan volume Railway dan mount ke path `/data`.
4. Set environment variable `DATA_FILE=/data/app.db`.
5. Deploy, lalu pastikan health check `https://domain-anda/api/health` merespons `ok: true`.

Setelah domain backend aktif, web yang dibuka dari domain itu akan langsung memakai backend yang sama tanpa config tambahan.

## Instal di HP

Untuk PWA:

1. Upload project ke hosting HTTPS yang juga menjalankan backend.
2. Jika domain API berbeda, build asset dengan `DAPOERMUDA_API_BASE_URL=https://domain-api-anda.com npm run build:web`
3. Buka link aplikasi di Chrome Android.
4. Pilih install atau tambahkan ke layar utama.

## Build APK Android

Project ini sekarang juga sudah punya folder `android/` untuk build APK native.

APK debug hasil build ada di:

`android/app/build/outputs/apk/debug/app-debug.apk`

Untuk build APK final yang signed:

`npm run android:final`

Output final:

- `android/app/build/outputs/apk/final/app-final.apk`

Untuk mengunci URL backend ke APK:

1. Deploy backend dulu dan dapatkan URL publiknya, misalnya `https://dapoermuda-production.up.railway.app`
2. Jalankan:
   `powershell -ExecutionPolicy Bypass -File scripts/build-android-debug.ps1 -ApiBaseUrl "https://dapoermuda-production.up.railway.app"`
3. APK baru akan memakai backend itu secara otomatis.

Untuk build final dengan backend publik:

`powershell -ExecutionPolicy Bypass -File scripts/build-android-release.ps1 -ApiBaseUrl "https://dapoermuda-production.up.railway.app" -VersionName "1.0.0" -VersionCode 1`

Catatan:

- APK final dibuat dari jalur build Android yang paling stabil, lalu ditandatangani dengan keystore final lokal.
- Keystore final lokal dibuat otomatis sekali dan disimpan hanya di mesin ini.
- File sensitif rilis tidak ikut masuk Git.
