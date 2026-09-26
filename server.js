const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');

// Dynamic import for ESM packages like archiver
let archiver;
import('archiver').then(mod => { archiver = mod.default || mod; }).catch(err => console.error(err));


const mime = require('mime-types');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Helper to load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Gagal membaca config.json, menggunakan default:', err.message);
  }
  return {
    adminPassword: 'admin',
    enforceLocalOnly: true,
    port: 3000,
    sharedFolders: [
      {
        id: 'uploads-default',
        name: 'Folder Upload Publik',
        path: path.join(__dirname, 'uploads'),
        allowUpload: true,
        allowDownload: true,
        requiresOtp: false,
        otp: ''
      }
    ]
  };
}

// Helper to save configuration
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Gagal menyimpan config.json:', err.message);
    return false;
  }
}

let config = loadConfig();

// Get local IPv4 addresses
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  addresses.sort((a, b) => {
    const isA_192 = a.address.startsWith('192.168.');
    const isB_192 = b.address.startsWith('192.168.');
    if (isA_192 && !isB_192) return -1;
    if (!isA_192 && isB_192) return 1;
    return 0;
  });
  return addresses;
}

// Local subnet check
function isLocalIp(ip) {
  if (!ip) return false;
  // Clean IPv6 prefix
  let cleanedIp = ip.replace(/^::ffff:/, '');
  if (cleanedIp === '127.0.0.1' || cleanedIp === '::1' || cleanedIp === 'localhost') return true;

  const parts = cleanedIp.split('.').map(Number);
  if (parts.length === 4) {
    // 10.0.0.0 - 10.255.255.255
    if (parts[0] === 10) return true;
    // 172.16.0.0 - 172.31.255.255
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0 - 192.168.255.255
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0 - 169.254.255.255
    if (parts[0] === 169 && parts[1] === 254) return true;
  }
  return false;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'local-file-share-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 jam
}));

// Initialize session state helper
app.use((req, res, next) => {
  if (!req.session.verifiedFolders) {
    req.session.verifiedFolders = {};
  }
  next();
});

// Middleware for checking local network access restriction
app.use((req, res, next) => {
  if (config.enforceLocalOnly) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!isLocalIp(clientIp)) {
      return res.status(403).json({
        error: 'Akses Ditolak',
        message: 'Aplikasi ini hanya dapat diakses dari jaringan lokal Intranet / Wi-Fi lokal.'
      });
    }
  }
  next();
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Safe path calculation helper
function getSafePath(baseFolderPath, subPath = '') {
  const resolvedBase = path.resolve(baseFolderPath);
  const normalizedSubPath = path.normalize(subPath || '').replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.resolve(resolvedBase, normalizedSubPath);

  if (!targetPath.startsWith(resolvedBase)) {
    throw new Error('Akses ke luar jalur direktori tidak diizinkan!');
  }
  return targetPath;
}

// Multer storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const folderId = req.params.id;
      const sharedFolder = config.sharedFolders.find(f => f.id === folderId);
      if (!sharedFolder) {
        return cb(new Error('Folder tidak ditemukan'));
      }

      // Check OTP if required
      if (sharedFolder.requiresOtp && !req.session.verifiedFolders[folderId]) {
        return cb(new Error('OTP belum diverifikasi'));
      }

      const relativePath = req.query.subpath || '';
      // Support uploading folder structure if file.originalname contains path
      let fileSubDir = '';
      if (req.body && req.body.relativePath) {
        fileSubDir = path.dirname(req.body.relativePath);
      } else if (file.originalname && file.originalname.includes('/')) {
        fileSubDir = path.dirname(file.originalname);
      }

      const fullDest = getSafePath(sharedFolder.path, path.join(relativePath, fileSubDir));
      if (!fs.existsSync(fullDest)) {
        fs.mkdirSync(fullDest, { recursive: true });
      }
      cb(null, fullDest);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const filename = path.basename(file.originalname);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // Limit 10GB per file
});

// ------------------- PUBLIC APIS -------------------

// System Info & Network QR Code
app.get('/api/system-info', async (req, res) => {
  const ips = getLocalIpAddresses();
  const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
  const localUrl = `http://${primaryIp}:${config.port}`;
  
  let qrCodeUrl = '';
  try {
    qrCodeUrl = await QRCode.toDataURL(localUrl);
  } catch (err) {
    console.error('Gagal membuat QR Code:', err);
  }

  res.json({
    port: config.port,
    ips: ips,
    primaryIp: primaryIp,
    localUrl: localUrl,
    qrCodeUrl: qrCodeUrl,
    enforceLocalOnly: config.enforceLocalOnly
  });
});

// Get List of Shared Folders for Users
app.get('/api/folders', (req, res) => {
  const userFolders = config.sharedFolders.map(folder => {
    return {
      id: folder.id,
      name: folder.name,
      allowUpload: folder.allowUpload,
      allowDownload: folder.allowDownload,
      requiresOtp: folder.requiresOtp,
      isVerified: folder.requiresOtp ? !!req.session.verifiedFolders[folder.id] : true
    };
  });
  res.json(userFolders);
});

// Verify OTP for a specific folder
app.post('/api/folders/:id/verify-otp', (req, res) => {
  const folderId = req.params.id;
  const { otp } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) {
    return res.status(404).json({ success: false, message: 'Folder tidak ditemukan' });
  }

  if (!folder.requiresOtp) {
    req.session.verifiedFolders[folderId] = true;
    return res.json({ success: true, message: 'Folder tidak membutuhkan OTP' });
  }

  if (otp && otp.trim() === folder.otp.trim()) {
    req.session.verifiedFolders[folderId] = true;
    return res.json({ success: true, message: 'OTP Berhasil diverifikasi' });
  }

  res.status(401).json({ success: false, message: 'Kode OTP/PIN salah!' });
});

// List files in a shared folder
app.get('/api/folders/:id/contents', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) {
    return res.status(404).json({ error: 'Folder tidak ditemukan' });
  }

  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP_REQUIRED', message: 'Folder ini dilindungi OTP/PIN' });
  }

  try {
    const targetPath = getSafePath(folder.path, subpath);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Path tidak ditemukan di server' });
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const result = items.map(item => {
      const itemFullPath = path.join(targetPath, item.name);
      let stat = {};
      try {
        stat = fs.statSync(itemFullPath);
      } catch (e) {}

      return {
        name: item.name,
        isDirectory: item.isDirectory(),
        size: item.isDirectory() ? 0 : stat.size || 0,
        mtime: stat.mtime || null,
        extension: item.isDirectory() ? '' : path.extname(item.name).toLowerCase()
      };
    });

    // Sort folders first, then files alphabetically
    result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      folderName: folder.name,
      subpath: subpath,
      allowUpload: folder.allowUpload,
      allowDownload: folder.allowDownload,
      items: result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download or Preview Single File
app.get('/api/folders/:id/file', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const isPreview = req.query.preview === '1';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) {
    return res.status(404).send('Folder tidak ditemukan');
  }

  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).send('Akses ditolak: OTP diperlukan');
  }

  if (!folder.allowDownload && !isPreview) {
    return res.status(403).send('Unduh file tidak diizinkan untuk folder ini');
  }

  try {
    const filePath = getSafePath(folder.path, subpath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return res.status(404).send('File tidak ditemukan');
    }

    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    if (isPreview) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// Download Folder as ZIP
app.get('/api/folders/:id/download-zip', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) {
    return res.status(404).send('Folder tidak ditemukan');
  }

  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).send('OTP diperlukan');
  }

  if (!folder.allowDownload) {
    return res.status(403).send('Unduh folder tidak diizinkan');
  }

  try {
    const targetPath = getSafePath(folder.path, subpath);
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      return res.status(404).send('Folder tidak ditemukan');
    }

    const zipName = (path.basename(subpath) || folder.name) + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => res.status(500).send({ error: err.message }));
    archive.pipe(res);
    archive.directory(targetPath, false);
    archive.finalize();
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// Upload File(s)
app.post('/api/folders/:id/upload', (req, res) => {
  const folderId = req.params.id;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) {
    return res.status(404).json({ error: 'Folder tidak ditemukan' });
  }

  if (!folder.allowUpload) {
    return res.status(403).json({ error: 'Unggah file tidak diizinkan di folder ini' });
  }

  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP belum diverifikasi' });
  }

  const uploadHandler = upload.array('files');
  uploadHandler(req, res, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Gagal mengunggah file: ' + err.message });
    }
    res.json({ success: true, message: `${req.files ? req.files.length : 0} file berhasil diunggah` });
  });
});

// Create New Subfolder
app.post('/api/folders/:id/create-folder', (req, res) => {
  const folderId = req.params.id;
  const { subpath, newFolderName } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Membuat folder tidak diizinkan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  try {
    const parentPath = getSafePath(folder.path, subpath || '');
    const newPath = path.join(parentPath, newFolderName.trim());
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
      return res.json({ success: true, message: 'Folder baru berhasil dibuat' });
    } else {
      return res.status(400).json({ error: 'Folder dengan nama tersebut sudah ada' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete File or Folder
app.delete('/api/folders/:id/delete', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Penghapusan tidak diizinkan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  try {
    const targetPath = getSafePath(folder.path, subpath);
    if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'File/folder tidak ditemukan' });

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    res.json({ success: true, message: 'Item berhasil dihapus' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ------------------- ADMIN APIS -------------------

// Admin Middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Halaman ini memerlukan login Admin' });
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password === config.adminPassword) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: 'Login Admin Berhasil' });
  }
  res.status(401).json({ success: false, message: 'Password Admin salah!' });
});

// Admin Logout
app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// Admin Check Status
app.get('/api/admin/status', (req, res) => {
  res.json({
    isAdmin: !!req.session.isAdmin
  });
});

// Get Admin Config & Shared Folders
app.get('/api/admin/config', requireAdmin, (req, res) => {
  res.json({
    adminPassword: config.adminPassword,
    enforceLocalOnly: config.enforceLocalOnly,
    port: config.port,
    sharedFolders: config.sharedFolders
  });
});

// Update System Settings
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { adminPassword, enforceLocalOnly } = req.body;
  if (adminPassword) config.adminPassword = adminPassword;
  if (typeof enforceLocalOnly === 'boolean') config.enforceLocalOnly = enforceLocalOnly;
  
  if (saveConfig(config)) {
    res.json({ success: true, message: 'Pengaturan sistem berhasil diperbarui' });
  } else {
    res.status(500).json({ error: 'Gagal menyimpan konfigurasi' });
  }
});

// Add Shared Folder
app.post('/api/admin/folders', requireAdmin, (req, res) => {
  const { name, folderPath, allowUpload, allowDownload, requiresOtp, otp } = req.body;

  if (!name || !folderPath) {
    return res.status(400).json({ error: 'Nama folder dan path lokal wajib diisi' });
  }

  const resolvedPath = path.resolve(folderPath);

  // Auto create folder if it does not exist
  if (!fs.existsSync(resolvedPath)) {
    try {
      fs.mkdirSync(resolvedPath, { recursive: true });
    } catch (err) {
      return res.status(400).json({ error: 'Gagal membuat/menemukan direktori di server: ' + err.message });
    }
  }

  const newFolder = {
    id: 'folder-' + Date.now(),
    name: name.trim(),
    path: resolvedPath,
    allowUpload: !!allowUpload,
    allowDownload: !!allowDownload,
    requiresOtp: !!requiresOtp,
    otp: otp ? otp.trim() : ''
  };

  config.sharedFolders.push(newFolder);
  if (saveConfig(config)) {
    res.json({ success: true, folder: newFolder });
  } else {
    res.status(500).json({ error: 'Gagal menyimpan folder baru' });
  }
});

// Update Shared Folder
app.put('/api/admin/folders/:id', requireAdmin, (req, res) => {
  const folderId = req.params.id;
  const index = config.sharedFolders.findIndex(f => f.id === folderId);

  if (index === -1) {
    return res.status(404).json({ error: 'Folder tidak ditemukan' });
  }

  const { name, folderPath, allowUpload, allowDownload, requiresOtp, otp } = req.body;

  if (name) config.sharedFolders[index].name = name.trim();
  if (folderPath) {
    const resolvedPath = path.resolve(folderPath);
    if (!fs.existsSync(resolvedPath)) {
      try {
        fs.mkdirSync(resolvedPath, { recursive: true });
      } catch (err) {
        return res.status(400).json({ error: 'Path tidak valid: ' + err.message });
      }
    }
    config.sharedFolders[index].path = resolvedPath;
  }

  if (typeof allowUpload === 'boolean') config.sharedFolders[index].allowUpload = allowUpload;
  if (typeof allowDownload === 'boolean') config.sharedFolders[index].allowDownload = allowDownload;
  if (typeof requiresOtp === 'boolean') config.sharedFolders[index].requiresOtp = requiresOtp;
  if (otp !== undefined) config.sharedFolders[index].otp = otp.trim();

  if (saveConfig(config)) {
    res.json({ success: true, folder: config.sharedFolders[index] });
  } else {
    res.status(500).json({ error: 'Gagal memperbarui konfigurasi folder' });
  }
});

// Delete Shared Folder from Config
app.delete('/api/admin/folders/:id', requireAdmin, (req, res) => {
  const folderId = req.params.id;
  const initialLen = config.sharedFolders.length;
  config.sharedFolders = config.sharedFolders.filter(f => f.id !== folderId);

  if (config.sharedFolders.length === initialLen) {
    return res.status(404).json({ error: 'Folder tidak ditemukan' });
  }

  if (saveConfig(config)) {
    res.json({ success: true, message: 'Folder berhasil dihapus dari daftar shared' });
  } else {
    res.status(500).json({ error: 'Gagal menghapus folder' });
  }
});

// Server File Explorer Helper for Admin
app.post('/api/admin/system-browse', requireAdmin, (req, res) => {
  const targetDir = req.body.path ? path.resolve(req.body.path) : 'D:\\';
  try {
    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ error: 'Direktori tidak ditemukan' });
    }
    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    const folders = items
      .filter(item => item.isDirectory())
      .map(item => ({
        name: item.name,
        path: path.join(targetDir, item.name)
      }));

    res.json({
      currentPath: targetDir,
      parentPath: path.dirname(targetDir) !== targetDir ? path.dirname(targetDir) : null,
      folders: folders
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start Server
const PORT = config.port || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`\n==================================================`);
  console.log(`🚀 LAN FILE SHARE APPLICATION READY`);
  console.log(`==================================================`);
  console.log(`Akses Lokal Komputer: http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`Akses Jaringan Wi-Fi/Intranet (${ip.name}): http://${ip.address}:${PORT}`);
  });
  console.log(`==================================================\n`);
});
