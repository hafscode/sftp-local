let currentFolderId = null;
let currentSubpath = '';
let currentFoldersData = [];
let currentSystemInfo = null;

document.addEventListener('DOMContentLoaded', () => {
  initSystemInfo();
  loadSharedFolders();
  setupEventListeners();
});

function setupEventListeners() {
  // Copy LAN URL button
  document.getElementById('btn-copy-url').addEventListener('click', () => {
    if (currentSystemInfo && currentSystemInfo.localUrl) {
      navigator.clipboard.writeText(currentSystemInfo.localUrl);
      alert('Link LAN berhasil disalin: ' + currentSystemInfo.localUrl);
    }
  });

  // Show QR Modal button
  document.getElementById('btn-show-qr').addEventListener('click', () => {
    openModal('modal-qr');
  });

  // OTP Form submit
  document.getElementById('form-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const folderId = document.getElementById('otp-folder-id').value;
    const otp = document.getElementById('otp-input').value;
    await verifyOtp(folderId, otp);
  });

  // Create Folder Form submit
  document.getElementById('form-create-folder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('new-folder-name').value;
    await createSubfolder(newName);
  });

  document.getElementById('btn-create-folder').addEventListener('click', () => {
    document.getElementById('new-folder-name').value = '';
    openModal('modal-create-folder');
  });

  // Download ZIP button
  document.getElementById('btn-download-zip').addEventListener('click', () => {
    if (!currentFolderId) return;
    const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(currentSubpath)}`;
    window.open(url, '_blank');
  });

  // File Upload Handlers
  const fileInputFiles = document.getElementById('file-input-files');
  const fileInputFolder = document.getElementById('file-input-folder');
  const dropzone = document.getElementById('dropzone');

  fileInputFiles.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  });

  fileInputFolder.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  });

  // Drag & Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  });
}

// Modal Helper Functions
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Fetch System LAN info
async function initSystemInfo() {
  try {
    const res = await fetch('/api/system-info');
    const data = await res.json();
    currentSystemInfo = data;

    const bannerText = document.getElementById('lan-status-text');
    if (data.ips && data.ips.length > 0) {
      const ipList = data.ips.map(i => `${i.address}:${data.port}`).join(' | ');
      bannerText.innerHTML = `Alamat LAN Server: <strong>http://${data.primaryIp}:${data.port}</strong> (Semua IP: ${ipList})`;
    } else {
      bannerText.innerHTML = `Alamat Server Lokal: <strong>http://localhost:${data.port}</strong>`;
    }

    if (data.qrCodeUrl) {
      document.getElementById('qr-code-img').src = data.qrCodeUrl;
      document.getElementById('qr-url-text').innerText = data.localUrl;
    }
  } catch (err) {
    console.error('Gagal mengambil data sistem:', err);
  }
}

// Load Available Shared Folders
async function loadSharedFolders() {
  try {
    const res = await fetch('/api/folders');
    const folders = await res.json();
    currentFoldersData = folders;

    const tabsContainer = document.getElementById('folder-tabs');
    tabsContainer.innerHTML = '';

    if (folders.length === 0) {
      tabsContainer.innerHTML = '<p style="color: var(--text-muted);">Belum ada folder yang di-share oleh Admin.</p>';
      return;
    }

    folders.forEach((folder, index) => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
      
      let badge = '';
      if (folder.requiresOtp) {
        badge = folder.isVerified ? '<span class="badge-otp" style="background:var(--success-color);color:#fff">🔓 OTP OK</span>' : '<span class="badge-otp">🔒 OTP</span>';
      }

      btn.innerHTML = `📁 ${escapeHtml(folder.name)} ${badge}`;
      btn.addEventListener('click', () => selectFolder(folder.id));
      tabsContainer.appendChild(btn);
    });

    // Select first folder by default
    if (folders.length > 0 && !currentFolderId) {
      selectFolder(folders[0].id);
    }
  } catch (err) {
    console.error('Gagal memuat folder:', err);
  }
}

// Select Active Shared Folder
async function selectFolder(folderId) {
  currentFolderId = folderId;
  currentSubpath = '';
  
  // Update Tab Active UI
  const folder = currentFoldersData.find(f => f.id === folderId);
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn, index) => {
    if (currentFoldersData[index] && currentFoldersData[index].id === folderId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (folder && folder.requiresOtp && !folder.isVerified) {
    document.getElementById('otp-folder-id').value = folderId;
    document.getElementById('otp-input').value = '';
    openModal('modal-otp');
    document.getElementById('file-list').innerHTML = `
      <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <h3>🔒 Folder Dilindungi OTP</h3>
        <p style="margin-top: 0.5rem;">Masukkan PIN/OTP pada pop-up untuk membuka isi folder ini.</p>
      </div>`;
    return;
  }

  await loadFolderContents(folderId, '');
}

// Verify OTP
async function verifyOtp(folderId, otp) {
  try {
    const res = await fetch(`/api/folders/${folderId}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp })
    });
    const data = await res.json();

    if (data.success) {
      closeModal('modal-otp');
      await loadSharedFolders();
      await loadFolderContents(folderId, '');
    } else {
      alert(data.message || 'OTP salah!');
    }
  } catch (err) {
    alert('Gagal verifikasi OTP: ' + err.message);
  }
}

// Load Folder Contents & Files
async function loadFolderContents(folderId, subpath) {
  currentFolderId = folderId;
  currentSubpath = subpath;

  try {
    const res = await fetch(`/api/folders/${folderId}/contents?subpath=${encodeURIComponent(subpath)}`);
    if (res.status === 401) {
      document.getElementById('otp-folder-id').value = folderId;
      openModal('modal-otp');
      return;
    }

    const data = await res.json();
    if (data.error) {
      alert('Error: ' + data.error);
      return;
    }

    renderBreadcrumb(data.folderName, subpath);
    renderFileList(data.items, data.allowUpload, data.allowDownload);

    // Toggle Upload dropzone & Create Folder button visibility
    const dropzone = document.getElementById('dropzone');
    const btnCreate = document.getElementById('btn-create-folder');
    const btnZip = document.getElementById('btn-download-zip');

    dropzone.style.display = data.allowUpload ? 'block' : 'none';
    btnCreate.style.display = data.allowUpload ? 'inline-flex' : 'none';
    btnZip.style.display = data.allowDownload ? 'inline-flex' : 'none';

  } catch (err) {
    console.error('Gagal membaca direktori:', err);
  }
}

// Render Breadcrumb Navigation
function renderBreadcrumb(rootName, subpath) {
  const container = document.getElementById('breadcrumb-paths');
  container.innerHTML = '';

  const rootSpan = document.createElement('span');
  rootSpan.className = 'breadcrumb-item';
  rootSpan.innerText = rootName;
  rootSpan.addEventListener('click', () => loadFolderContents(currentFolderId, ''));
  container.appendChild(rootSpan);

  if (!subpath) return;

  const parts = subpath.split(/[\/\\]/).filter(p => p.length > 0);
  let accumulatedPath = '';

  parts.forEach((part, index) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.innerText = ' / ';
    container.appendChild(sep);

    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
    const targetPath = accumulatedPath;

    const itemSpan = document.createElement('span');
    itemSpan.className = 'breadcrumb-item';
    itemSpan.innerText = part;
    itemSpan.addEventListener('click', () => loadFolderContents(currentFolderId, targetPath));
    container.appendChild(itemSpan);
  });
}

// Render Files and Subfolders List
function renderFileList(items, allowUpload, allowDownload) {
  const container = document.getElementById('file-list');
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
        <p>Folder ini masih kosong.</p>
      </div>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'file-row';

    const icon = getFileIcon(item);
    const itemSubpath = currentSubpath ? `${currentSubpath}/${item.name}` : item.name;

    let sizeText = item.isDirectory ? 'Folder' : formatFileSize(item.size);
    let dateText = item.mtime ? new Date(item.mtime).toLocaleString('id-ID') : '';

    let actionButtons = '';
    if (item.isDirectory) {
      actionButtons += `<button class="btn btn-secondary" onclick="event.stopPropagation(); loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}')">Buka 📂</button>`;
      if (allowDownload) {
        actionButtons += `<button class="btn btn-secondary" onclick="event.stopPropagation(); downloadZip('${escapeJsStr(itemSubpath)}')">.ZIP 📦</button>`;
      }
    } else {
      if (canPreview(item.extension)) {
        actionButtons += `<button class="btn btn-secondary" onclick="event.stopPropagation(); previewFile('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}', '${item.extension}')">Lihat 👁️</button>`;
      }
      if (allowDownload) {
        actionButtons += `<button class="btn btn-success" onclick="event.stopPropagation(); downloadFile('${escapeJsStr(itemSubpath)}')">Unduh ⬇️</button>`;
      }
    }

    if (allowUpload) {
      actionButtons += `<button class="btn btn-danger" onclick="event.stopPropagation(); deleteItem('${escapeJsStr(itemSubpath)}')">Hapus 🗑️</button>`;
    }

    row.innerHTML = `
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <a href="javascript:void(0)" class="file-name" onclick="${item.isDirectory ? `loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}')` : `downloadFile('${escapeJsStr(itemSubpath)}')`}">${escapeHtml(item.name)}</a>
        <div class="file-meta">${sizeText} • ${dateText}</div>
      </div>
      <div></div>
      <div class="file-actions">${actionButtons}</div>
    `;

    container.appendChild(row);
  });
}

// Download File
function downloadFile(subpath) {
  const url = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
  window.open(url, '_blank');
}

// Download Folder ZIP
function downloadZip(subpath) {
  const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(subpath)}`;
  window.open(url, '_blank');
}

// Delete Item
async function deleteItem(subpath) {
  if (!confirm(`Apakah Anda yakin ingin menghapus "${subpath}"?`)) return;

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/delete?subpath=${encodeURIComponent(subpath)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      await loadFolderContents(currentFolderId, currentSubpath);
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Create Subfolder
async function createSubfolder(newFolderName) {
  try {
    const res = await fetch(`/api/folders/${currentFolderId}/create-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subpath: currentSubpath,
        newFolderName: newFolderName
      })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modal-create-folder');
      await loadFolderContents(currentFolderId, currentSubpath);
    } else {
      alert('Gagal membuat folder: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Upload Files / Folders with progress
function uploadFiles(files) {
  if (!currentFolderId) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    formData.append('files', file);
    // Include webkitRelativePath if present for folder upload preserving structure
    if (file.webkitRelativePath) {
      formData.append('relativePath', file.webkitRelativePath);
    }
  }

  const progressContainer = document.getElementById('upload-progress-container');
  const progressFill = document.getElementById('upload-progress-fill');
  const statusText = document.getElementById('upload-status-text');

  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  statusText.innerText = `Mengunggah ${files.length} file...`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/folders/${currentFolderId}/upload?subpath=${encodeURIComponent(currentSubpath)}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = percent + '%';
      statusText.innerText = `Mengunggah ${files.length} file (${percent}%)...`;
    }
  };

  xhr.onload = async () => {
    progressContainer.style.display = 'none';
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      alert(response.message || 'File berhasil diunggah');
      await loadFolderContents(currentFolderId, currentSubpath);
    } else {
      const response = JSON.parse(xhr.responseText);
      alert('Gagal mengunggah: ' + (response.error || 'Server error'));
    }
  };

  xhr.onerror = () => {
    progressContainer.style.display = 'none';
    alert('Terjadi kesalahan jaringan saat mengunggah.');
  };

  xhr.send(formData);
}

// File Preview Helper
function canPreview(ext) {
  const mediaExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.txt', '.json', '.md'];
  return mediaExts.includes(ext.toLowerCase());
}

function previewFile(subpath, filename, ext) {
  const container = document.getElementById('preview-container');
  container.innerHTML = '';
  document.getElementById('preview-filename').innerText = filename;

  const fileUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}&preview=1`;

  const lowerExt = ext.toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(lowerExt)) {
    container.innerHTML = `<img src="${fileUrl}" alt="${escapeHtml(filename)}">`;
  } else if (['.mp4', '.webm'].includes(lowerExt)) {
    container.innerHTML = `<video src="${fileUrl}" controls autoplay></video>`;
  } else if (['.mp3', '.wav'].includes(lowerExt)) {
    container.innerHTML = `<audio src="${fileUrl}" controls autoplay></audio>`;
  } else if (lowerExt === '.pdf') {
    container.innerHTML = `<iframe src="${fileUrl}"></iframe>`;
  } else if (['.txt', '.json', '.md', '.js', '.html', '.css'].includes(lowerExt)) {
    container.innerHTML = `<p style="color:var(--text-muted)">Memuat isi teks...</p>`;
    fetch(fileUrl)
      .then(res => res.text())
      .then(text => {
        container.innerHTML = `<pre style="background:var(--bg-primary); padding:1rem; border-radius:8px; width:100%; max-height:60vh; overflow:auto; font-family:monospace; font-size:0.9rem;">${escapeHtml(text)}</pre>`;
      });
  }

  openModal('modal-preview');
}

// Icon mapper
function getFileIcon(item) {
  if (item.isDirectory) return '📁';
  const ext = item.extension.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) return '🖼️';
  if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext)) return '🎬';
  if (['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) return '🎵';
  if (ext === '.pdf') return '📄';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return '📦';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) return '📝';
  if (['.txt', '.json', '.js', '.css', '.html', '.md', '.py'].includes(ext)) return '💻';
  return '📄';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJsStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
