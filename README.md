# 📁 ShareDrive Local LAN - Windows File Explorer Web Application

**ShareDrive Local LAN** adalah aplikasi manajemen file berbasis web (*Web-based File Explorer*) yang dirancang menyerupai antarmuka **Windows 11 File Explorer**. Aplikasi ini memungkinkan pengguna untuk berbagi, melihat pratinjau (*preview*), mengunggah (*upload*), dan mengunduh (*download*) file atau folder pada server lokal di dalam jaringan **Intranet / Wi-Fi bersama** (modem lokal) secara aman dan terisolasi.

---

## 🛠️ 1. Summary Teknologi & Tools yang Digunakan

### **Backend Framework & Runtime**
* **Node.js (v18+)**: Lingkungan eksekusi JavaScript sisi server (*server-side runtime*).
* **Express.js (v4.21+)**: Framework web server untuk menyediakan RESTful API, penanganan file static, dan pengelolaan sesi pengguna.
* **Express Session (v1.18+)**: Manajemen sesi autentikasi Admin dan verifikasi OTP folder.

### **Pengolahan & Keamanan Berkas (File Processing)**
* **Multer (v1.4+)**: Handling pengunggahan file tunggal, banyak file, dan pembuatan struktur folder bertingkat (*nested directory upload*).
* **Archiver (v7.0+)**: *Streaming engine* untuk mengompresi dan mengunduh direktori/folder secara langsung dalam format `.zip`.
* **Mime-Types (v2.1+)**: Deteksi otomatis jenis berkas (*MIME content-type*) untuk pratinjau media dan pengunduhan berkas.
* **QRCode (v1.5+)**: Generator QR Code dinamis untuk memudahkan perangkat HP (*smartphone*) terhubung ke alamat IP server lokal.

### **Frontend & Antarmuka Pengguna (UI/UX)**
* **HTML5 & CSS3 Responsive**: Desain antarmuka bertema **Windows 11 Dark Explorer** dengan dukungan tampilan responsif (*Mobile Drawer Sidebar*, *Touch-friendly controls*).
* **Vanilla JavaScript (ES6+)**: Logika klien tanpa build step eksternal (mengelola navigasi *history*, sortir tabel interaktif, pencarian *root*, pratinjau media, dan interaksi drag-and-drop).

---

## ⚙️ 2. Prasyarat Sistem & Tools (Prerequisites)

Sebelum menjalankan aplikasi di komputer server lokal, pastikan tools berikut telah terpasang:

1. **Node.js** (Versi 18.0 atau lebih baru) & **npm**:
   * Unduh di: [https://nodejs.org/](https://nodejs.org/)
   * Verifikasi pemasangan di Terminal / PowerShell:
     ```bash
     node -v
     npm -v
     ```
2. **Git** (Opsional, untuk melakukan clone repository):
   * Unduh di: [https://git-scm.com/](https://git-scm.com/)
3. **Browser Web Modern**:
   * Google Chrome, Microsoft Edge, Mozilla Firefox, atau Safari (Desktop & Mobile).

---

## 📥 3. Langkah-langkah Instalasi (Installation Steps)

### **Langkah 1: Clone Repository / Unduh Source Code**
Buka PowerShell atau Command Prompt, lalu klon repository dari GitHub:
```bash
git clone https://github.com/hafscode/sftp-local.git
cd sftp-local
```
*(Atau ekstrak folder project `sftp-apps` ke dalam direktori pilihan Anda, misalnya `D:\sftp-apps`)*.

### **Langkah 2: Install Dependensi Node.js**
Jalankan perintah berikut di dalam folder project untuk mengunduh seluruh modul paket yang dibutuhkan:
```bash
npm install
```

---

## 🚀 4. Langkah-langkah Menjalankan & Mengakses di Server Lokal

### **Langkah 1: Jalankan Server Aplikasi**
Di dalam folder project, jalankan skrip berikut:
* **Windows (Double click atau via CMD/PowerShell)**:
  ```cmd
  script-run.bat
  ```
* **Git Bash / Linux**:
  ```bash
  ./script-run.sh
  ```

Saat server berhasil berjalan, log terminal akan menampilkan alamat akses server:
```text
==================================================
🚀 LAN FILE SHARE APPLICATION READY
==================================================
Akses Lokal Komputer: http://localhost:3000
Akses Jaringan Wi-Fi/Intranet (Ethernet): http://192.168.30.111:3000
==================================================
```

---

### **Langkah 2: Mengakses Aplikasi di Berbagai Perangkat**

#### **A. Dari Komputer Server Sendiri**
Buka browser di komputer server dan akses:
👉 **`http://localhost:3000`**

#### **B. Dari Perangkat HP / Laptop Lain di Wi-Fi yang Sama**
1. Pastikan HP atau laptop lain sudah terhubung ke jaringan **Wi-Fi / Router Modem yang sama** dengan komputer server.
2. Buka browser HP/Laptop dan masukkan alamat IP LAN server, contoh:
   👉 **`http://192.168.30.111:3000`**
3. **Scan QR Code HP**:
   Pada tampilan web desktop, klik tombol **`📱 HP Connect`** di pojok kanan atas untuk menampilkan QR Code. Scan QR Code menggunakan kamera HP untuk langsung membuka web aplikasi tanpa mengetik alamat IP.

---

### **Langkah 3: Mematikan Server (Shutdown Script)**
Untuk menghentikan server yang sedang berjalan di port 3000:
* **Windows Batch**:
  ```cmd
  script-shutdown.bat
  ```
* **Git Bash / Linux**:
  ```bash
  ./script-shutdown.sh
  ```

---

## ⚡ 5. Konfigurasi Otomatis Berjalan saat Komputer Di-restart (Windows AutoStart)

Aplikasi telah dilengkapi dengan fitur **AutoStart otomatis** ketika Windows dinyalakan atau di-restart:

1. **Aktifkan AutoStart**:
   Double click file `setup-autostart.bat` (atau jalankan via CMD). Skrip ini akan secara otomatis memasang *silent background launcher* (`run-background.vbs`) ke dalam folder Windows Startup (`shell:startup`).
2. **Cara Kerja AutoStart**:
   Saat komputer menyala/di-restart, Windows akan menjalankan server `node server.js` secara senyap (*background silent mode*) tanpa membuka jendela terminal CMD yang mengganggu desktop.
3. **Matikan AutoStart**:
   Jika Anda ingin menghentikan fitur autostart, jalankan `remove-autostart.bat`.

---

## 🔒 6. Fitur Utama & Panduan Penggunaan

### **A. Pengaturan Admin Panel (`/admin.html`)**
* Akses halaman Admin: **`http://localhost:3000/admin.html`**
* **Password Default Admin**: `admin` *(dapat diubah di menu Pengaturan Keamanan Server)*.
* **Fitur Utama Admin**:
  1. **Tambah / Kelola Folder Shared**: Tentukan direktori lokal mana saja di harddisk server (misalnya `D:\Dokumen`, `D:\Shared\Uploads`, dll.) yang ingin dibagikan.
  2. **Atur Hak Akses**: Tentukan apakah pengguna diizinkan untuk **Upload**, **Download**, atau keduanya pada folder tertentu.
  3. **Proteksi OTP / PIN**: Aktifkan proteksi kode PIN/OTP pada folder tertentu. Pengguna wajib memasukkan PIN yang ditentukan Admin sebelum dapat membaca atau mengunduh isi folder tersebut.
  4. **File Browser Komputer Server**: Fitur penjelajah folder interaktif untuk memudahkan Admin memilih direktori di komputer server.
  5. **Restriksi Intranet Only**: Memastikan server menolak otomatis setiap permintaan yang berasal dari luar range IP jaringan lokal (HTTP 403 Forbidden).

---

### **B. Tampilan Windows Explorer User Portal (`index.html`)**
* **Sidebar Kiri (Folder Tree Structure)**:
  * Menampilkan struktur pohon direktori (*Directory Tree*) yang dapat di-expand (`▶`/`▼`).
  * Pada layar HP/Mobile view, sidebar dapat dibuka/ditutup melalui tombol Hamburger menu **`☰`**.
* **Navigasi Explorer**:
  * Tombol **`⬅️ Kembali`**, **`➡️ Maju`**, **`⬆️ Folder Induk`**, dan **`🔄 Refresh`**.
* **Details Table View**:
  * Menampilkan kolom **Nama**, **Tanggal Modifikasi**, **Ukuran**, dan **Tindakan**.
  * **Fitur Sortir Interaktif**: Klik judul kolom (*Nama*, *Tanggal Modifikasi*, atau *Ukuran*) untuk mengurutkan berkas secara naik (*Ascending 🔼*) atau turun (*Descending 🔽*).
* **Pencarian Root (Search Bar)**:
  * Kotak pencarian `🔍` di bagian atas navigasi untuk mencari berkas atau subfolder secara instan di seluruh tingkat kedalaman root folder.
* **Pratinjau File & Unduh Modal**:
  * Mengklik nama file akan membuka **Popup Pratinjau Modal** (Gambar, Video, Musik/Audio, PDF, dan Teks/Kode).
  * Di dalam popup modal pratinjau tersedia tombol **`⬇️ Unduh File`** untuk langsung mengunduh berkas.

---

## 📁 7. Struktur Direktori Project

```text
sftp-local/
├── server.js               # Backend Node.js Express server & REST API
├── config.json             # Konfigurasi aplikasi & daftar shared folder
├── package.json            # Daftar dependensi modul npm
├── script-run.sh           # Skrip start untuk Bash/Linux
├── script-run.bat          # Skrip start untuk Windows CMD
├── script-shutdown.sh      # Skrip mematikan server untuk Bash/Linux
├── script-shutdown.bat     # Skrip mematikan server untuk Windows CMD
├── run-background.vbs      # Silent background launcher untuk Windows AutoStart
├── setup-autostart.bat     # Skrip aktivasi AutoStart saat Windows boot/restart
├── remove-autostart.bat    # Skrip deaktivasi AutoStart Windows
├── uploads/                # Direktori folder upload publik default
├── public/                 # Static asset frontend
│   ├── index.html          # Halaman utama Windows Explorer Portal
│   ├── admin.html          # Halaman Dashboard Admin Panel
│   ├── css/
│   │   └── style.css       # CSS Windows 11 Dark Theme & Responsive Mobile Rules
│   └── js/
│       ├── app.js          # Logika frontend Explorer, Tree, Sortir, & Modal
│       └── admin.js        # Logika frontend Dashboard Admin & Server File Browser
└── README.md               # Dokumentasi lengkap panduan aplikasi
```

---

## 📝 8. Lisensi & Pemeliharaan
Aplikasi ini dikembangkan untuk penggunaan berbagi berkas berkecepatan tinggi dalam jaringan area lokal (LAN/Intranet). All rights reserved.
