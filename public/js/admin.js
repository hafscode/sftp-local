let sysBrowseCurrentPath = 'D:\\';
let editingFolderId = null;
let currentAdminStats = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminStatus();
  setupAdminEventListeners();
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('app-theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('app-theme', theme);

  const btnToggle = document.getElementById('btn-toggle-theme');
  if (btnToggle) {
    btnToggle.innerText = theme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode';
  }

  const selectTheme = document.getElementById('set-app-theme');
  if (selectTheme) {
    selectTheme.value = theme;
  }
}

function setupAdminEventListeners() {
  // Theme Toggle Header Button
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = current === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

  // Theme Select Change Handler
  const setAppTheme = document.getElementById('set-app-theme');
  if (setAppTheme) {
    setAppTheme.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

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
    const themeVal = document.getElementById('set-app-theme').value;
    const portVal = document.getElementById('set-app-port').value;

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: newPass || undefined,
          enforceLocalOnly: enforceLocal,
          theme: themeVal,
          port: portVal ? Number(portVal) : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Pengaturan sistem, tema & port berhasil disimpan!');
        document.getElementById('set-admin-pass').value = '';
        if (data.theme) applyTheme(data.theme);
        loadAdminDashboard();
      } else {
        alert('Gagal menyimpan: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Open Stats Detail Modal Trigger
  const btnShowDetailStats = document.getElementById('btn-show-detail-stats');
  if (btnShowDetailStats) {
    btnShowDetailStats.addEventListener('click', () => {
      if (currentAdminStats) {
        renderAdminStatsDetailModal(currentAdminStats);
        openModal('modal-admin-stats-detail');
      } else {
        loadAdminStats().then(() => {
          if (currentAdminStats) {
            renderAdminStatsDetailModal(currentAdminStats);
            openModal('modal-admin-stats-detail');
          }
        });
      }
    });
  }

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

  // Close modal overlays when clicking outside modal-card (backdrop click)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
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

// Load Admin Dashboard Data & Stats
async function loadAdminDashboard() {
  try {
    // Load LAN Status
    const sysRes = await fetch('/api/system-info');
    const sysData = await sysRes.json();
    
    const lanInfo = document.getElementById('admin-lan-info');
    if (sysData.ips && sysData.ips.length > 0) {
      const ipList = sysData.ips.map(i => `http://${i.address}:${sysData.port}`).join(' | ');
      lanInfo.innerHTML = `URL LAN: <strong>${ipList}</strong> | Access Restriction: ${sysData.enforceLocalOnly ? '<span class="badge badge-success">Intranet Only Active</span>' : '<span class="badge badge-warning">All IP Allowed</span>'}`;
    }

    if (sysData.theme && !localStorage.getItem('app-theme')) {
      applyTheme(sysData.theme);
    } else {
      initTheme();
    }

    // Load Admin Config & Shared Folders
    const configRes = await fetch('/api/admin/config');
    if (configRes.status === 401) {
      checkAdminStatus();
      return;
    }
    const configData = await configRes.json();

    document.getElementById('set-enforce-local').checked = !!configData.enforceLocalOnly;
    const portInput = document.getElementById('set-app-port');
    if (portInput) {
      portInput.value = configData.port || 2323;
    }
    if (configData.theme && !localStorage.getItem('app-theme')) {
      applyTheme(configData.theme);
    }

    renderAdminFolderCards(configData.sharedFolders);

    // Load Storage & File Category Stats
    await loadAdminStats();

  } catch (err) {
    console.error('Gagal memuat dashboard admin:', err);
  }
}

// Fetch Admin Stats
async function loadAdminStats() {
  try {
    const statsRes = await fetch('/api/admin/stats');
    if (!statsRes.ok) return;
    const stats = await statsRes.json();
    currentAdminStats = stats;

    // Render Stat Cards Values
    const totalBytes = stats.totalBytes || 0;
    const totalFiles = stats.totalFiles || 0;
    const totalFolders = stats.totalFolders || 0;

    document.getElementById('stat-total-size').innerText = formatFileSize(totalBytes);
    document.getElementById('stat-total-count').innerText = `${totalFiles} file (${totalFolders} folder)`;

    // Format: jumlah / ukuran
    document.getElementById('stat-img-info').innerText = `${stats.images.count} file / ${formatFileSize(stats.images.bytes)}`;
    document.getElementById('stat-doc-info').innerText = `${stats.documents.count} file / ${formatFileSize(stats.documents.bytes)}`;
    document.getElementById('stat-app-info').innerText = `${stats.applications.count} file / ${formatFileSize(stats.applications.bytes)}`;

    // Disk Drive Stats
    if (stats.drives && stats.drives.length > 0) {
      const drive = stats.drives[0];
      const freeStr = formatFileSize(drive.free);
      const totalStr = formatFileSize(drive.total);
      const usedStr = formatFileSize(drive.used);
      const usedPct = drive.total > 0 ? ((drive.used / drive.total) * 100).toFixed(1) : 0;

      document.getElementById('stat-disk-free').innerText = `${freeStr} Tersisa`;
      document.getElementById('stat-disk-sub').innerText = `Terpakai ${usedStr} dari ${totalStr} (${usedPct}%)`;

      const fillEl = document.getElementById('stat-disk-progress');
      if (fillEl) {
        fillEl.style.width = `${usedPct}%`;
        fillEl.className = usedPct > 90 ? 'stat-progress-fill danger' : (usedPct > 75 ? 'stat-progress-fill warning' : 'stat-progress-fill success');
      }
    }
  } catch (err) {
    console.error('Gagal memuat statistik storage:', err);
  }
}

// Render SVG Donut Circle Chart & Detail Modal Table
function renderAdminStatsDetailModal(stats) {
  const svgChart = document.getElementById('svg-donut-chart');
  const legendContainer = document.getElementById('chart-legend-container');
  const tbody = document.getElementById('detail-breakdown-tbody');

  if (!stats) return;

  const drive = (stats.drives && stats.drives.length > 0) ? stats.drives[0] : { total: 0, free: 0, used: 0 };
  const driveTotal = drive.total || 1;
  const driveFree = drive.free || 0;
  const driveUsed = drive.used || 0;
  const usedPct = ((driveUsed / driveTotal) * 100).toFixed(1);

  document.getElementById('donut-center-main').innerText = formatFileSize(driveTotal);
  document.getElementById('donut-center-sub').innerText = `Total Storage ${drive.drive || ''}`;

  document.getElementById('detail-disk-text').innerText = `Sisa Storage: ${formatFileSize(driveFree)} tersisa dari ${formatFileSize(driveTotal)} (${(100 - usedPct).toFixed(1)}% Kosong)`;
  const fillEl = document.getElementById('detail-disk-fill');
  if (fillEl) {
    fillEl.style.width = `${usedPct}%`;
  }

  // Categories Breakdown
  const imgBytes = stats.images ? stats.images.bytes : 0;
  const docBytes = stats.documents ? stats.documents.bytes : 0;
  const appBytes = stats.applications ? stats.applications.bytes : 0;
  const otherBytes = stats.others ? stats.others.bytes : 0;
  const sharedTotalBytes = stats.totalBytes || 1;

  const categories = [
    { name: '🖼️ Gambar (Image)', count: stats.images.count, bytes: imgBytes, color: '#3b82f6' },
    { name: '📝 Dokumen (Document)', count: stats.documents.count, bytes: docBytes, color: '#10b981' },
    { name: '🚀 Aplikasi (App/Zip)', count: stats.applications.count, bytes: appBytes, color: '#f59e0b' },
    { name: '📦 Berkas Lainnya', count: stats.others.count, bytes: otherBytes, color: '#8b5cf6' }
  ];

  // Render SVG Donut Segments
  // Circle radius r = 38, Circumference C = 2 * PI * 38 = ~238.76
  const R = 38;
  const C = 2 * Math.PI * R;
  let accumAngle = 0;

  let svgHtml = `<circle cx="50" cy="50" r="${R}" fill="transparent" stroke="var(--win-border)" stroke-width="12" />`;

  categories.forEach(cat => {
    const fraction = sharedTotalBytes > 0 ? (cat.bytes / sharedTotalBytes) : 0;
    if (fraction > 0) {
      const dashLength = fraction * C;
      const spaceLength = C - dashLength;
      const strokeOffset = -accumAngle;
      accumAngle += dashLength;

      svgHtml += `
        <circle cx="50" cy="50" r="${R}" fill="transparent"
          stroke="${cat.color}" stroke-width="12"
          stroke-dasharray="${dashLength} ${spaceLength}"
          stroke-dashoffset="${strokeOffset}"
          transform="rotate(-90 50 50)" />
      `;
    }
  });

  if (svgChart) svgChart.innerHTML = svgHtml;

  // Render Legend List
  if (legendContainer) {
    legendContainer.innerHTML = categories.map(cat => {
      const pct = sharedTotalBytes > 0 ? ((cat.bytes / sharedTotalBytes) * 100).toFixed(1) : 0;
      return `
        <div class="legend-item">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span class="legend-color" style="background: ${cat.color};"></span>
            <span>${cat.name}</span>
          </div>
          <strong>${formatFileSize(cat.bytes)} (${pct}%)</strong>
        </div>
      `;
    }).join('');
  }

  // Render Breakdown Table Rows
  if (tbody) {
    tbody.innerHTML = categories.map(cat => {
      const pct = sharedTotalBytes > 0 ? ((cat.bytes / sharedTotalBytes) * 100).toFixed(1) : 0;
      return `
        <tr>
          <td style="display: flex; align-items: center; gap: 0.4rem;">
            <span class="legend-color" style="background: ${cat.color};"></span>
            <span>${cat.name}</span>
          </td>
          <td><strong>${cat.count} file</strong></td>
          <td>${formatFileSize(cat.bytes)}</td>
          <td><span class="badge" style="background: rgba(96, 165, 250, 0.15); color: var(--win-accent);">${pct}%</span></td>
        </tr>
      `;
    }).join('');
  }
}

// Render Shared Folders Cards
function renderAdminFolderCards(folders) {
  const container = document.getElementById('admin-folder-list');
  container.innerHTML = '';

  if (!folders || folders.length === 0) {
    container.innerHTML = `<p style="color: var(--win-text-muted);">Belum ada folder yang di-share. Klik "Tambah Folder Shared Baru".</p>`;
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
        <h4 style="font-size: 1.05rem;">📁 ${escapeHtml(folder.name)}</h4>
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">${otpBadge}</div>
      </div>
      <div style="font-size: 0.85rem; color: var(--win-text-muted); word-break: break-all;">
        Path: <code>${escapeHtml(folder.path)}</code>
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
        ${downloadBadge} ${uploadBadge}
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; justify-content: flex-end;">
        <button class="btn-icon" style="background: var(--win-card); border-color: var(--win-border);" onclick="editFolder('${folder.id}')">Edit ✏️</button>
        <button class="btn-icon danger" style="background: var(--win-danger); color: #fff;" onclick="deleteFolder('${folder.id}')">Hapus 🗑️</button>
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
      listContainer.innerHTML = '<p style="color: var(--win-text-muted); font-size: 0.85rem;">Tidak ada sub-folder di direktori ini.</p>';
    } else {
      data.folders.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 0.4rem 0.6rem; cursor: pointer; border-bottom: 1px solid var(--win-border); font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;';
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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
