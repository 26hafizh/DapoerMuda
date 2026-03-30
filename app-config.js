// Konfigurasi ini untuk pemilik aplikasi saat deploy.
// Pengguna kasir tidak perlu mengisi apa pun di dalam aplikasi.
window.DAPOERMUDA_APP_CONFIG = Object.assign({
  // Contoh: 'https://pos-warung-anda.example.com/api'
  apiBaseUrl: '',
  requestTimeoutMs: 12000
}, window.DAPOERMUDA_APP_CONFIG || {});
