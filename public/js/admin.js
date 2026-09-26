let sysBrowseCurrentPath = 'D:\\';
let editingFolderId = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAdminStatus();
  setupAdminEventListeners();
});

function setupAdminEventListeners() {
  // Login Form
  document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('admin-pass').value;
    await adminLogin(pass);
  });

  // Logout Button
  document.getElementById('btn-admin-logout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    checkAdminStatus();
  });

  // System Settings Form
  document.getElementById('form-system-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('set-admin-pass').value;
    const enforceLocal = document.getElementById('set-enforce-local').checked;

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: newPass || undefined,
          enforceLocalOnly: enforceLocal
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Pengaturan sistem berhasil disimpan!');
        document.getElementById('set-admin-pass').value = '';
        loadAdminDashboard();
      } else {
        alert('Gagal menyimpan: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Open Add Folder Modal
  document.getElementById('btn-add-folder-modal').addEventListener('click', () => {
    editingFolderId = null;
    document.getElementById('folder-editor-title').innerText = 'Tambah Folder Shared Baru';
    document.getElementById('edit-folder-id').value = '';
    document.getElementById('edit-folder-name').value = '';
    document.getElementById('edit-folder-path').value = 'D:\\sftp-apps\\uploads';
    document.getElementById('edit-allow-download').checked = true;
    document.getElementById('edit-allow-upload').checked = true;
    document.getElementById('edit-requires-otp').checked = false;
    document.getElementById('edit-otp-code').value = '';
    document.getElementById('otp-input-group').style.display = 'none';

    openModal('modal-folder-editor');
  });

  // Toggle OTP Input Group visibility
  document.getElementById('edit-requires-otp').addEventListener('change', (e) => {
    document.getElementById('otp-input-group').style.display = e.target.checked ? 'block' : 'none';
  });

  // Folder Editor Form Submit
  document.getElementById('form-folder-editor').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveFolderConfig();
  });

  // System Browse Button
  document.getElementById('btn-browse-sys').addEventListener('click', () => {
    const currentInputPath = document.getElementById('edit-folder-path').value;
    sysBrowseCurrentPath = currentInputPath ? currentInputPath : 'D:\\';
    openSystemBrowse(sysBrowseCurrentPath);
  });

  // System Browse Parent Button
  document.getElementById('btn-sys-browse-up').addEventListener('click', () => {
    if (sysBrowseCurrentPath) {
      const parts = sysBrowseCurrentPath.split(/[\/\\]/).filter(p => p.length > 0);
      if (parts.length > 1) {
        parts.pop();
        sysBrowseCurrentPath = parts.join('\\');
      } else {
        sysBrowseCurrentPath = 'D:\\';
      }
      openSystemBrowse(sysBrowseCurrentPath);
    }
  });

  // System Browse Select Folder Button
  document.getElementById('btn-sys-browse-select').addEventListener('click', () => {
    document.getElementById('edit-folder-path').value = sysBrowseCurrentPath;
    closeModal('modal-sys-browse');
  });
}

// Check Admin Login Status
async function checkAdminStatus() {
  try {
    const res = await fetch('/api/admin/status');
    const data = await res.json();

    const loginSec = document.getElementById('admin-login-section');
    const dashSec = document.getElementById('admin-dashboard-section');
    const logoutBtn = document.getElementById('btn-admin-logout');

    if (data.isAdmin) {
      loginSec.style.display = 'none';
      dashSec.style.display = 'block';
      logoutBtn.style.display = 'inline-flex';
      loadAdminDashboard();
    } else {
      loginSec.style.display = 'block';
      dashSec.style.display = 'none';
      logoutBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('Gagal mengecek status admin:', err);
  }
}

// Submit Admin Login
async function adminLogin(password) {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      checkAdminStatus();
    } else {
      alert(data.message || 'Password Admin salah!');
    }
  } catch (err) {
    alert('Error login: ' + err.message);
  }
}

// Load Admin Dashboard Data
async function loadAdminDashboard() {
  try {
    // Load LAN Status
    const sysRes = await fetch('/api/system-info');
    const sysData = await sysRes.json();
    
    const lanInfo = document.getElementById('admin-lan-info');
    if (sysData.ips && sysData.ips.length > 0) {
      const ipList = sysData.ips.map(i => `http://${i.address}:${sysData.port}`).join(' | ');
      lanInfo.innerHTML = `URL LAN: <strong>${ipList}</strong> | Restriction: ${sysData.enforceLocalOnly ? '<span class="badge badge-success">Intranet Only Active</span>' : '<span class="badge badge-warning">All IP Allowed</span>'}`;
    }

    // Load Admin Config & Shared Folders
    const configRes = await fetch('/api/admin/config');
    if (configRes.status === 401) {
      checkAdminStatus();
      return;
    }
    const configData = await configRes.json();

    document.getElementById('set-enforce-local').checked = !!configData.enforceLocalOnly;

    renderAdminFolderCards(configData.sharedFolders);

  } catch (err) {
    console.error('Gagal memuat dashboard admin:', err);
  }
}

// Render Shared Folders Cards
function renderAdminFolderCards(folders) {
  const container = document.getElementById('admin-folder-list');
  container.innerHTML = '';

  if (!folders || folders.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted);">Belum ada folder yang di-share. Klik "Tambah Folder Shared Baru".</p>`;
    return;
  }

  folders.forEach(folder => {
    const card = document.createElement('div');
    card.className = 'folder-card';

    const uploadBadge = folder.allowUpload ? '<span class="badge badge-success">Upload ✅</span>' : '<span class="badge badge-danger">Upload ❌</span>';
    const downloadBadge = folder.allowDownload ? '<span class="badge badge-success">Download ✅</span>' : '<span class="badge badge-danger">Download ❌</span>';
    const otpBadge = folder.requiresOtp ? `<span class="badge badge-warning">🔒 OTP: ${escapeHtml(folder.otp)}</span>` : '<span class="badge badge-success">Publik (Tanpa OTP)</span>';

    card.innerHTML = `
      <div class="folder-card-header">
        <h4 style="font-size: 1.1rem;">📁 ${escapeHtml(folder.name)}</h4>
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">${otpBadge}</div>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted); word-break: break-all;">
        Path: <code>${escapeHtml(folder.path)}</code>
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
        ${downloadBadge} ${uploadBadge}
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="editFolder('${folder.id}')">Edit ✏️</button>
        <button class="btn btn-danger" onclick="deleteFolder('${folder.id}')">Hapus 🗑️</button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Save Folder Config (Add or Edit)
async function saveFolderConfig() {
  const folderId = editingFolderId;
  const name = document.getElementById('edit-folder-name').value;
  const folderPath = document.getElementById('edit-folder-path').value;
  const allowDownload = document.getElementById('edit-allow-download').checked;
  const allowUpload = document.getElementById('edit-allow-upload').checked;
  const requiresOtp = document.getElementById('edit-requires-otp').checked;
  const otp = document.getElementById('edit-otp-code').value;

  const payload = {
    name,
    folderPath,
    allowDownload,
    allowUpload,
    requiresOtp,
    otp
  };

  const url = folderId ? `/api/admin/folders/${folderId}` : '/api/admin/folders';
  const method = folderId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      closeModal('modal-folder-editor');
      loadAdminDashboard();
    } else {
      alert('Gagal menyimpan folder: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Edit Folder Modal Trigger
async function editFolder(folderId) {
  try {
    const configRes = await fetch('/api/admin/config');
    const configData = await configRes.json();
    const folder = configData.sharedFolders.find(f => f.id === folderId);

    if (!folder) return alert('Folder tidak ditemukan');

    editingFolderId = folderId;
    document.getElementById('folder-editor-title').innerText = 'Edit Folder Shared';
    document.getElementById('edit-folder-id').value = folder.id;
    document.getElementById('edit-folder-name').value = folder.name;
    document.getElementById('edit-folder-path').value = folder.path;
    document.getElementById('edit-allow-download').checked = !!folder.allowDownload;
    document.getElementById('edit-allow-upload').checked = !!folder.allowUpload;
    document.getElementById('edit-requires-otp').checked = !!folder.requiresOtp;
    document.getElementById('edit-otp-code').value = folder.otp || '';
    document.getElementById('otp-input-group').style.display = folder.requiresOtp ? 'block' : 'none';

    openModal('modal-folder-editor');

  } catch (err) {
    alert('Gagal memuat detail folder: ' + err.message);
  }
}

// Delete Folder Trigger
async function deleteFolder(folderId) {
  if (!confirm('Apakah Anda yakin ingin menghapus folder ini dari daftar shared? (Isi file fisik di komputer TIDAK akan terhapus)')) return;

  try {
    const res = await fetch(`/api/admin/folders/${folderId}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      loadAdminDashboard();
    } else {
      alert('Gagal menghapus folder: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Server System Folder Browser
async function openSystemBrowse(targetPath) {
  try {
    const res = await fetch('/api/admin/system-browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath })
    });
    const data = await res.json();

    if (data.error) {
      alert('Gagal membuka path: ' + data.error);
      return;
    }

    sysBrowseCurrentPath = data.currentPath;
    document.getElementById('sys-browse-path').innerText = 'Path: ' + data.currentPath;

    const listContainer = document.getElementById('sys-browse-list');
    listContainer.innerHTML = '';

    if (!data.folders || data.folders.length === 0) {
      listContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Tidak ada sub-folder di direktori ini.</p>';
    } else {
      data.folders.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 0.4rem 0.6rem; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;';
        div.innerHTML = `📁 ${escapeHtml(item.name)}`;
        div.addEventListener('click', () => openSystemBrowse(item.path));
        listContainer.appendChild(div);
      });
    }

    openModal('modal-sys-browse');

  } catch (err) {
    alert('Gagal membuka file browser server: ' + err.message);
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
