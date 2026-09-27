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
    port: 2323,
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
    const isA_192 = a.address.startsWith('192.168.') || a.address.startsWith('192.');
    const isB_192 = b.address.startsWith('192.168.') || b.address.startsWith('192.');
    if (isA_192 && !isB_192) return -1;
    if (!isA_192 && isB_192) return 1;

    const isA_10 = a.address.startsWith('10.');
    const isB_10 = b.address.startsWith('10.');
    if (isA_10 && !isB_10) return -1;
    if (!isA_10 && isB_10) return 1;

    const isA_172 = a.address.startsWith('172.');
    const isB_172 = b.address.startsWith('172.');
    if (isA_172 && !isB_172) return 1;
    if (!isA_172 && isB_172) return -1;

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

function getUniqueFilename(destDir, originalName) {
  const filename = path.basename(originalName);
  const ext = path.extname(filename);
  const targetFullPath = path.join(destDir, filename);
  const isDir = fs.existsSync(targetFullPath) ? fs.statSync(targetFullPath).isDirectory() : ext === '';

  let candidate = filename;
  let counter = 1;

  while (fs.existsSync(path.join(destDir, candidate))) {
    if (ext && !isDir) {
      const nameWithoutExt = path.basename(filename, ext);
      candidate = `${nameWithoutExt} (${counter})${ext}`;
    } else {
      candidate = `${filename} (${counter})`;
    }
    counter++;
  }
  return candidate;
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
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
    try {
      const folderId = req.params.id;
      const sharedFolder = config.sharedFolders.find(f => f.id === folderId);
      const relativePath = req.query.subpath || '';
      let fileSubDir = '';
      if (req.body && req.body.relativePath) {
        fileSubDir = path.dirname(req.body.relativePath);
      } else if (file.originalname && file.originalname.includes('/')) {
        fileSubDir = path.dirname(file.originalname);
      }

      const fullDest = getSafePath(sharedFolder ? sharedFolder.path : __dirname, path.join(relativePath, fileSubDir));
      const originalBasename = path.basename(file.originalname);
      const conflictAction = req.query.action || 'replace';

      if (conflictAction === 'rename') {
        const uniqueName = getUniqueFilename(fullDest, originalBasename);
        cb(null, uniqueName);
      } else {
        cb(null, originalBasename);
      }
    } catch (err) {
      cb(err);
    }
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
  const primaryIp = ips.length > 0 ? ips[0].address : '127.0.0.1';
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
    enforceLocalOnly: config.enforceLocalOnly,
    theme: config.theme || 'dark'
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
    const result = [];
    for (const item of items) {
      const itemFullPath = path.join(targetPath, item.name);
      try {
        const stat = fs.statSync(itemFullPath);
        result.push({
          name: item.name,
          isDirectory: item.isDirectory(),
          size: item.isDirectory() ? 0 : stat.size || 0,
          mtime: stat.mtime || null,
          extension: item.isDirectory() ? '' : path.extname(item.name).toLowerCase()
        });
      } catch (e) {
        // Skip inaccessible or delete-pending ghost files on Windows NTFS
      }
    }

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

// Recursive search helper
function searchFilesInDirectory(basePath, currentSubpath, query, results = [], maxResults = 200) {
  if (results.length >= maxResults) return results;
  const targetPath = path.join(basePath, currentSubpath);
  if (!fs.existsSync(targetPath)) return results;

  let items = [];
  try {
    items = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (e) {
    return results;
  }

  for (const item of items) {
    if (results.length >= maxResults) break;
    const itemSubpath = currentSubpath ? path.join(currentSubpath, item.name) : item.name;
    const fullPath = path.join(targetPath, item.name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue; // Skip inaccessible or delete-pending ghost files
    }

    if (item.name.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        name: item.name,
        subpath: itemSubpath.replace(/\\/g, '/'),
        isDirectory: item.isDirectory(),
        size: item.isDirectory() ? 0 : stat.size || 0,
        mtime: stat.mtime || null,
        extension: item.isDirectory() ? '' : path.extname(item.name).toLowerCase()
      });
    }

    if (item.isDirectory()) {
      searchFilesInDirectory(basePath, itemSubpath, query, results, maxResults);
    }
  }
  return results;
}

// Get subdirectories tree helper
function getSubdirectories(basePath, currentSubpath = '') {
  const targetPath = path.join(basePath, currentSubpath);
  if (!fs.existsSync(targetPath)) return [];

  try {
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    return items
      .filter(item => item.isDirectory())
      .map(item => ({
        name: item.name,
        subpath: currentSubpath ? `${currentSubpath}/${item.name}` : item.name
      }));
  } catch (e) {
    return [];
  }
}

// Global Search endpoint across folder root
app.get('/api/folders/:id/search', (req, res) => {
  const folderId = req.params.id;
  const query = req.query.q || '';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP_REQUIRED' });
  }

  if (!query.trim()) {
    return res.json({ items: [] });
  }

  try {
    const matches = searchFilesInDirectory(folder.path, '', query.trim());
    res.json({
      folderName: folder.name,
      query: query,
      items: matches
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Subdirectories for sidebar tree expansion
app.get('/api/folders/:id/subdirs', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP_REQUIRED' });
  }

  try {
    const subdirs = getSubdirectories(folder.path, subpath);
    res.json({ subdirs });
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
      res.sendFile(filePath, { maxAge: '1d' });
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
      res.sendFile(filePath);
    }
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

// Check if file(s) exist in destination folder before uploading
app.post('/api/folders/:id/check-exists', (req, res) => {
  const folderId = req.params.id;
  const subpath = req.query.subpath || '';
  const { filenames } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!filenames || !Array.isArray(filenames)) {
    return res.json({ existing: [] });
  }

  const existing = [];
  try {
    filenames.forEach(relFile => {
      const targetFilePath = getSafePath(folder.path, path.join(subpath, relFile));
      if (fs.existsSync(targetFilePath) && !fs.statSync(targetFilePath).isDirectory()) {
        existing.push(relFile);
      }
    });
    res.json({ existing });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
      try { fs.chmodSync(targetPath, 0o666); } catch (e) {}
      fs.unlinkSync(targetPath);
    }
    res.json({ success: true, message: 'Item berhasil dihapus' });
  } catch (err) {
    res.status(400).json({ error: 'Gagal menghapus: ' + err.message });
  }
});

// Rename File or Folder
app.post('/api/folders/:id/rename', (req, res) => {
  const folderId = req.params.id;
  const { subpath, newName } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Perubahan nama tidak diizinkan di folder ini' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!subpath || !newName || !newName.trim()) {
    return res.status(400).json({ error: 'Nama baru tidak boleh kosong' });
  }

  try {
    const oldPath = getSafePath(folder.path, subpath);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File atau folder tidak ditemukan' });

    const parentDir = path.dirname(oldPath);
    const sanitizedNewName = path.basename(newName.trim());
    const newPath = getSafePath(folder.path, path.relative(folder.path, path.join(parentDir, sanitizedNewName)));

    if (fs.existsSync(newPath)) {
      return res.status(400).json({ error: `File atau folder dengan nama "${sanitizedNewName}" sudah ada` });
    }

    fs.renameSync(oldPath, newPath);
    res.json({ success: true, message: 'Nama berhasil diubah' });
  } catch (err) {
    res.status(400).json({ error: 'Gagal mengubah nama: ' + err.message });
  }
});

// Check if items exist in destination folder before pasting or moving
app.post('/api/folders/:id/check-paste-exists', (req, res) => {
  const folderId = req.params.id;
  const { items, targetSubpath } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ existing: [] });
  }

  const existing = [];
  try {
    const destDir = getSafePath(folder.path, targetSubpath || '');
    items.forEach(itemSubpath => {
      const basename = path.basename(itemSubpath);
      const destPath = path.join(destDir, basename);
      if (fs.existsSync(destPath)) {
        existing.push(basename);
      }
    });
    res.json({ existing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Copy Files/Folders
app.post('/api/folders/:id/copy', (req, res) => {
  const folderId = req.params.id;
  const { items, targetSubpath, conflictAction = 'rename' } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Salin file tidak diizinkan di folder ini' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Tidak ada item yang dipilih untuk disalin' });
  }

  try {
    const destDir = getSafePath(folder.path, targetSubpath || '');
    if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan' });
    }

    let copiedCount = 0;
    for (const itemSubpath of items) {
      const srcPath = getSafePath(folder.path, itemSubpath);
      if (!fs.existsSync(srcPath)) continue;

      const basename = path.basename(srcPath);
      let destPath = path.join(destDir, basename);

      // Avoid copying folder into itself
      if (fs.statSync(srcPath).isDirectory() && destPath.startsWith(srcPath)) {
        continue;
      }

      if (fs.existsSync(destPath)) {
        if (conflictAction === 'replace') {
          fs.rmSync(destPath, { recursive: true, force: true });
        } else {
          const uniqueName = getUniqueFilename(destDir, basename);
          destPath = path.join(destDir, uniqueName);
        }
      }

      copyRecursiveSync(srcPath, destPath);
      copiedCount++;
    }

    res.json({ success: true, message: `${copiedCount} item berhasil disalin` });
  } catch (err) {
    res.status(400).json({ error: 'Gagal menyalin item: ' + err.message });
  }
});

// Move (Cut & Paste) Files/Folders
app.post('/api/folders/:id/move', (req, res) => {
  const folderId = req.params.id;
  const { items, targetSubpath, conflictAction = 'rename' } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Memindahkan file tidak diizinkan di folder ini' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Tidak ada item yang dipilih untuk dipindahkan' });
  }

  try {
    const destDir = getSafePath(folder.path, targetSubpath || '');
    if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan' });
    }

    let movedCount = 0;
    for (const itemSubpath of items) {
      const srcPath = getSafePath(folder.path, itemSubpath);
      if (!fs.existsSync(srcPath)) continue;

      const basename = path.basename(srcPath);
      let destPath = path.join(destDir, basename);

      if (srcPath === destPath && conflictAction !== 'rename') continue;

      // Avoid moving folder into itself
      if (fs.statSync(srcPath).isDirectory() && destPath.startsWith(srcPath)) {
        continue;
      }

      if (fs.existsSync(destPath)) {
        if (srcPath === destPath || conflictAction === 'rename') {
          const uniqueName = getUniqueFilename(destDir, basename);
          destPath = path.join(destDir, uniqueName);
        } else if (conflictAction === 'replace') {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
      }

      try {
        fs.renameSync(srcPath, destPath);
      } catch (e) {
        copyRecursiveSync(srcPath, destPath);
        fs.rmSync(srcPath, { recursive: true, force: true });
      }
      movedCount++;
    }

    res.json({ success: true, message: `${movedCount} item berhasil dipindahkan` });
  } catch (err) {
    res.status(400).json({ error: 'Gagal memindahkan item: ' + err.message });
  }
});

// Download Selected Files/Folders as ZIP Archive
app.post('/api/folders/:id/download-selected-zip', (req, res) => {
  const folderId = req.params.id;
  const { items } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).send('Folder tidak ditemukan');
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).send('OTP diperlukan');
  }
  if (!folder.allowDownload) {
    return res.status(403).send('Unduh tidak diizinkan');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).send('Tidak ada item yang dipilih');
  }

  try {
    const zipName = `selected_files_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    for (const itemSubpath of items) {
      const targetPath = getSafePath(folder.path, itemSubpath);
      if (!fs.existsSync(targetPath)) continue;

      const stat = fs.statSync(targetPath);
      const entryName = path.basename(targetPath);
      if (stat.isDirectory()) {
        archive.directory(targetPath, entryName);
      } else {
        archive.file(targetPath, { name: entryName });
      }
    }

    archive.finalize();
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// Batch Delete Files/Folders
app.post('/api/folders/:id/batch-delete', (req, res) => {
  const folderId = req.params.id;
  const { items } = req.body;
  const folder = config.sharedFolders.find(f => f.id === folderId);

  if (!folder) return res.status(404).json({ error: 'Folder tidak ditemukan' });
  if (!folder.allowUpload) return res.status(403).json({ error: 'Penghapusan tidak diizinkan' });
  if (folder.requiresOtp && !req.session.verifiedFolders[folderId]) {
    return res.status(401).json({ error: 'OTP diperlukan' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Tidak ada item yang dipilih untuk dihapus' });
  }

  try {
    let deletedCount = 0;
    for (const itemSubpath of items) {
      const targetPath = getSafePath(folder.path, itemSubpath);
      if (!fs.existsSync(targetPath)) continue;

      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        try { fs.chmodSync(targetPath, 0o666); } catch (e) {}
        fs.unlinkSync(targetPath);
      }
      deletedCount++;
    }
    res.json({ success: true, message: `${deletedCount} item berhasil dihapus` });
  } catch (err) {
    res.status(400).json({ error: 'Gagal menghapus: ' + err.message });
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

// Get Disk Free & Total Space Helper
function getDiskSpace(targetPath) {
  try {
    const rootPath = path.parse(targetPath).root || targetPath;
    const stat = fs.statfsSync(rootPath);
    const bsize = stat.bsize || 4096;
    const total = stat.blocks * bsize;
    const free = stat.bavail * bsize;
    const used = total - free;
    return { drive: rootPath, total, free, used };
  } catch (err) {
    return { drive: targetPath, total: 0, free: 0, used: 0 };
  }
}

// Calculate Detailed Shared Folders Stats
function calculateSharedFoldersStats() {
  const stats = {
    totalBytes: 0,
    totalFiles: 0,
    totalFolders: 0,
    images: { count: 0, bytes: 0 },
    documents: { count: 0, bytes: 0 },
    applications: { count: 0, bytes: 0 },
    others: { count: 0, bytes: 0 },
    drives: []
  };

  const imgExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff', '.heic', '.raw']);
  const docExts = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.md', '.csv', '.json', '.xml', '.odt', '.ods', '.odp', '.rtf', '.log', '.epub']);
  const appExts = new Set(['.exe', '.msi', '.apk', '.dmg', '.deb', '.rpm', '.bat', '.cmd', '.sh', '.ps1', '.app', '.bin', '.iso', '.zip', '.rar', '.7z', '.tar', '.gz', '.jar']);

  const checkedDrives = new Set();

  (config.sharedFolders || []).forEach(folder => {
    if (!folder.path || !fs.existsSync(folder.path)) return;

    const rootDrive = path.parse(folder.path).root || 'D:\\';
    if (!checkedDrives.has(rootDrive)) {
      checkedDrives.add(rootDrive);
      stats.drives.push(getDiskSpace(rootDrive));
    }

    function walkDir(dirPath) {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        items.forEach(item => {
          const itemPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            stats.totalFolders++;
            walkDir(itemPath);
          } else if (item.isFile()) {
            try {
              const fileStat = fs.statSync(itemPath);
              const size = fileStat.size || 0;
              const ext = path.extname(item.name).toLowerCase();
              stats.totalFiles++;
              stats.totalBytes += size;

              if (imgExts.has(ext)) {
                stats.images.count++;
                stats.images.bytes += size;
              } else if (docExts.has(ext)) {
                stats.documents.count++;
                stats.documents.bytes += size;
              } else if (appExts.has(ext)) {
                stats.applications.count++;
                stats.applications.bytes += size;
              } else {
                stats.others.count++;
                stats.others.bytes += size;
              }
            } catch (e) {}
          }
        });
      } catch (e) {}
    }

    walkDir(folder.path);
  });

  return stats;
}

// Get Admin Detailed System & Storage Statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = calculateSharedFoldersStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghitung statistik: ' + err.message });
  }
});

// Get Admin Config & Shared Folders
app.get('/api/admin/config', requireAdmin, (req, res) => {
  res.json({
    adminPassword: config.adminPassword,
    enforceLocalOnly: config.enforceLocalOnly,
    theme: config.theme || 'dark',
    port: config.port,
    sharedFolders: config.sharedFolders
  });
});

// Update System Settings
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { adminPassword, enforceLocalOnly, theme, port } = req.body;
  if (adminPassword) config.adminPassword = adminPassword;
  if (typeof enforceLocalOnly === 'boolean') config.enforceLocalOnly = enforceLocalOnly;
  if (theme && ['dark', 'light'].includes(theme)) config.theme = theme;
  if (port && !isNaN(port) && Number(port) > 0 && Number(port) < 65536) {
    config.port = Number(port);
  }

  if (saveConfig(config)) {
    res.json({ success: true, message: 'Pengaturan sistem berhasil diperbarui', theme: config.theme || 'dark', port: config.port });
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
const PORT = config.port || 2323;
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
