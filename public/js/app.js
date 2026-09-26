let currentFolderId = null;
let currentSubpath = '';
let currentFoldersData = [];
let currentItems = [];
let currentSystemInfo = null;

// Navigation History Stack
let navHistory = [];
let historyIndex = -1;
let isUploadCompleted = false;

// Sorting state
let sortColumn = 'name'; // 'name', 'mtime', 'type', 'size'
let sortDirection = 'asc'; // 'asc' or 'desc'

// Search state
let isSearchMode = false;

document.addEventListener('DOMContentLoaded', () => {
  initSystemInfo();
  loadSharedFolders();
  setupEventListeners();
});

function setupEventListeners() {
  // Mobile Sidebar Toggle Handlers
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const sidebarContainer = document.getElementById('sidebar-container');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebarContainer.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');
    });
  }

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', closeSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  // Close modal overlays when clicking outside modal content card (backdrop click)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // Handle Mobile Hardware Back Button / Browser Back Button via HTML5 PopState
  window.addEventListener('popstate', (e) => {
    // 1. If any modal popup is active, close it first!
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      activeModal.classList.remove('active');
      return;
    }

    // 2. If mobile sidebar drawer is active, close it first!
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer && sidebarContainer.classList.contains('active')) {
      closeSidebar();
      return;
    }

    // 3. Handle folder history state navigation from hardware back button
    if (e.state && e.state.folderId !== undefined) {
      loadFolderContents(e.state.folderId, e.state.subpath || '', false);
      if (typeof e.state.historyIndex === 'number') {
        historyIndex = e.state.historyIndex;
      }
      updateNavButtonsState();
    } else {
      parseHashUrlAndNavigate();
    }
  });

  // Navigation buttons
  document.getElementById('btn-nav-back').addEventListener('click', goBack);
  document.getElementById('btn-nav-forward').addEventListener('click', goForward);
  document.getElementById('btn-nav-up').addEventListener('click', goUp);
  document.getElementById('btn-nav-refresh').addEventListener('click', refreshCurrentFolder);


  // Search Input Handler (Debounced)
  const searchInput = document.getElementById('search-input');
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length > 0) {
      searchTimeout = setTimeout(() => performSearch(query), 300);
    } else if (isSearchMode) {
      isSearchMode = false;
      loadFolderContents(currentFolderId, currentSubpath, false);
    }
  });

  // Action Toolbar Upload Buttons
  document.getElementById('btn-upload-file').addEventListener('click', () => {
    document.getElementById('file-input-files').click();
  });

  document.getElementById('btn-upload-folder').addEventListener('click', () => {
    document.getElementById('file-input-folder').click();
  });

  document.getElementById('file-input-files').addEventListener('change', (e) => {
    if (e.target.files.length > 0) uploadFiles(e.target.files);
  });

  document.getElementById('file-input-folder').addEventListener('change', (e) => {
    if (e.target.files.length > 0) uploadFiles(e.target.files);
  });

  // Floating Upload Widget Button Handler
  const btnFloatUpload = document.getElementById('btn-float-upload');
  if (btnFloatUpload) {
    btnFloatUpload.addEventListener('click', () => {
      openModal('modal-upload-detail');
    });
  }

  // Action Toolbar Create Folder & ZIP Buttons
  document.getElementById('btn-create-folder').addEventListener('click', () => {
    document.getElementById('new-folder-name').value = '';
    openModal('modal-create-folder');
  });

  document.getElementById('btn-download-zip').addEventListener('click', () => {
    if (!currentFolderId) return;
    const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(currentSubpath)}`;
    window.open(url, '_blank');
  });

  // QR Code Modal Trigger
  document.getElementById('btn-show-qr').addEventListener('click', () => {
    openModal('modal-qr');
  });

  // Forms
  document.getElementById('form-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const folderId = document.getElementById('otp-folder-id').value;
    const otp = document.getElementById('otp-input').value;
    await verifyOtp(folderId, otp);
  });

  document.getElementById('form-create-folder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('new-folder-name').value;
    await createSubfolder(newName);
  });

  // Drag and Drop files onto Main Content Area
  const mainContent = document.getElementById('main-content');
  const dragOverlay = document.getElementById('drag-overlay');

  mainContent.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragOverlay.classList.add('active');
  });

  dragOverlay.addEventListener('dragleave', () => {
    dragOverlay.classList.remove('active');
  });

  dragOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('active');
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  });
}

// System LAN Info
async function initSystemInfo() {
  try {
    const res = await fetch('/api/system-info');
    const data = await res.json();
    currentSystemInfo = data;

    const display = document.getElementById('lan-ip-display');
    display.innerHTML = `IP LAN: <strong>http://${data.primaryIp}:${data.port}</strong>`;

    if (data.qrCodeUrl) {
      document.getElementById('qr-code-img').src = data.qrCodeUrl;
      document.getElementById('qr-url-text').innerText = data.localUrl;
    }
  } catch (err) {
    console.error('Gagal mengambil data sistem:', err);
  }
}

// Load Root Shared Folders for Sidebar
async function loadSharedFolders() {
  try {
    const res = await fetch('/api/folders');
    const folders = await res.json();
    currentFoldersData = folders;

    const sidebarRootList = document.getElementById('sidebar-root-list');
    sidebarRootList.innerHTML = '';

    if (folders.length === 0) {
      sidebarRootList.innerHTML = '<p style="padding: 0.5rem 0.75rem; color: var(--win-text-dim); font-size: 0.85rem;">Belum ada root folder.</p>';
      return;
    }

    folders.forEach(folder => {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.dataset.id = folder.id;
      
      let badge = '';
      if (folder.requiresOtp) {
        badge = folder.isVerified ? ' 🔓' : ' 🔒';
      }

      item.innerHTML = `<span>📁</span> <span>${escapeHtml(folder.name)}${badge}</span>`;
      item.addEventListener('click', () => selectRootFolder(folder.id));
      sidebarRootList.appendChild(item);
    });

    if (folders.length > 0 && !currentFolderId) {
      selectRootFolder(folders[0].id);
    }
  } catch (err) {
    console.error('Gagal memuat root folder:', err);
  }
}

function closeSidebar() {
  const sidebarContainer = document.getElementById('sidebar-container');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarContainer) sidebarContainer.classList.remove('active');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

// Select Active Root Folder
async function selectRootFolder(folderId) {
  closeSidebar();
  currentFolderId = folderId;
  currentSubpath = '';
  isSearchMode = false;
  document.getElementById('search-input').value = '';

  const folder = currentFoldersData.find(f => f.id === folderId);
  updateSidebarActiveItem(folderId);

  if (folder && folder.requiresOtp && !folder.isVerified) {
    document.getElementById('otp-folder-id').value = folderId;
    document.getElementById('otp-input').value = '';
    openModal('modal-otp');
    document.getElementById('file-table-body').innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 3rem; color: var(--win-text-muted);">
          <h3>🔒 Folder Dilindungi OTP</h3>
          <p style="margin-top: 0.5rem;">Masukkan PIN/OTP untuk membaca struktur folder ini.</p>
        </td>
      </tr>`;
    return;
  }

  await loadFolderContents(folderId, '', true);
  await buildSidebarFolderTree(folderId);
}

// Build Sidebar Folder Structure Tree
async function buildSidebarFolderTree(folderId, subpath = '', targetParentEl = null) {
  try {
    const res = await fetch(`/api/folders/${folderId}/subdirs?subpath=${encodeURIComponent(subpath)}`);
    if (res.status !== 200) return;
    const data = await res.json();

    const parentEl = targetParentEl || document.getElementById('sidebar-tree-list');
    if (!targetParentEl) parentEl.innerHTML = '';

    if (!data.subdirs || data.subdirs.length === 0) {
      if (!targetParentEl) {
        parentEl.innerHTML = '<p style="padding: 0.25rem 0.75rem; color: var(--win-text-dim); font-size: 0.85rem;">(Tidak ada sub-folder)</p>';
      }
      return;
    }

    data.subdirs.forEach(dir => {
      const node = document.createElement('div');
      node.style.cssText = 'display: flex; flex-direction: column; margin-left: 0.5rem;';

      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.style.padding = '0.35rem 0.5rem';
      item.style.fontSize = '0.85rem';
      item.innerHTML = `<span class="tree-toggle">▶</span> <span>📁 ${escapeHtml(dir.name)}</span>`;

      const childContainer = document.createElement('div');
      childContainer.style.display = 'none';
      childContainer.style.marginLeft = '0.75rem';

      let isExpanded = false;
      item.querySelector('.tree-toggle').addEventListener('click', async (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        item.querySelector('.tree-toggle').innerText = isExpanded ? '▼' : '▶';
        if (isExpanded) {
          childContainer.style.display = 'block';
          if (childContainer.children.length === 0) {
            await buildSidebarFolderTree(folderId, dir.subpath, childContainer);
          }
        } else {
          childContainer.style.display = 'none';
        }
      });

      item.addEventListener('click', () => {
        closeSidebar();
        loadFolderContents(folderId, dir.subpath, true);
      });

      node.appendChild(item);
      node.appendChild(childContainer);
      parentEl.appendChild(node);
    });

  } catch (err) {
    console.error('Gagal memuat pohon folder:', err);
  }
}


// Load Folder Contents & Update History
async function loadFolderContents(folderId, subpath, pushHistory = true) {
  currentFolderId = folderId;
  currentSubpath = subpath;
  isSearchMode = false;

  if (pushHistory) {
    // Truncate history if navigated back and performed new navigation
    if (historyIndex < navHistory.length - 1) {
      navHistory = navHistory.slice(0, historyIndex + 1);
    }
    navHistory.push({ folderId, subpath });
    historyIndex = navHistory.length - 1;

    // Sync HTML5 History state so Mobile Hardware Back button navigates within file explorer
    const stateData = { folderId, subpath, historyIndex };
    const hashUrl = `#folder=${encodeURIComponent(folderId)}&subpath=${encodeURIComponent(subpath)}`;
    if (window.location.hash !== hashUrl) {
      history.pushState(stateData, '', hashUrl);
    }
  }
  updateNavButtonsState();

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

    currentItems = data.items || [];
    renderBreadcrumb(data.folderName, subpath);
    renderFileTable(currentItems);

    // Update Status Bar
    const totalSize = currentItems.reduce((acc, item) => acc + (item.size || 0), 0);
    document.getElementById('status-item-count').innerText = `${currentItems.length} item (${formatFileSize(totalSize)})`;

  } catch (err) {
    console.error('Gagal memuat isi direktori:', err);
  }
}

// Global Root Search Execution
async function performSearch(query) {
  if (!currentFolderId) return;
  isSearchMode = true;

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.error) {
      alert('Gagal mencari: ' + data.error);
      return;
    }

    currentItems = data.items || [];
    
    // Update breadcrumb to show search mode
    const breadcrumbContainer = document.getElementById('breadcrumb-paths');
    breadcrumbContainer.innerHTML = `<span class="breadcrumb-item">Hasil Pencarian: "${escapeHtml(query)}"</span>`;

    renderFileTable(currentItems);

    document.getElementById('status-item-count').innerText = `Ditemukan ${currentItems.length} hasil pencarian`;

  } catch (err) {
    console.error('Gagal melakukan pencarian:', err);
  }
}

// Render Breadcrumb Navigation
function renderBreadcrumb(rootName, subpath) {
  const container = document.getElementById('breadcrumb-paths');
  container.innerHTML = '';

  const rootSpan = document.createElement('span');
  rootSpan.className = 'breadcrumb-item';
  rootSpan.innerText = rootName;
  rootSpan.addEventListener('click', () => loadFolderContents(currentFolderId, '', true));
  container.appendChild(rootSpan);

  if (!subpath) return;

  const parts = subpath.split(/[\/\\]/).filter(p => p.length > 0);
  let accumulatedPath = '';

  parts.forEach((part) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.innerText = ' > ';
    container.appendChild(sep);

    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
    const targetPath = accumulatedPath;

    const itemSpan = document.createElement('span');
    itemSpan.className = 'breadcrumb-item';
    itemSpan.innerText = part;
    itemSpan.addEventListener('click', () => loadFolderContents(currentFolderId, targetPath, true));
    container.appendChild(itemSpan);
  });
}

// Render File Table (Explorer Details View)
function renderFileTable(items) {
  const tbody = document.getElementById('file-table-body');
  tbody.innerHTML = '';

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 3rem; color: var(--win-text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
          <p style="margin-bottom: 1rem;">${isSearchMode ? 'Tidak ada file/folder yang cocok dengan pencarian' : 'Folder ini kosong'}</p>
          ${!isSearchMode ? `<button class="btn-icon" style="background: var(--win-accent-dark); color: #fff; padding: 0.55rem 1.25rem;" onclick="document.getElementById('file-input-files').click()">📄 Upload File Ke Sini</button>` : ''}
        </td>
      </tr>`;
    return;
  }

  // Sort items
  const sortedItems = [...items].sort((a, b) => {
    // Keep folders at top by default unless sorting by specific file criteria
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (sortColumn === 'type') {
      valA = getFileTypeName(a);
      valB = getFileTypeName(b);
    } else if (sortColumn === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  sortedItems.forEach(item => {
    const tr = document.createElement('tr');

    const icon = getFileIcon(item);
    const itemSubpath = item.subpath ? item.subpath : (currentSubpath ? `${currentSubpath}/${item.name}` : item.name);
    const typeName = getFileTypeName(item);
    const sizeText = item.isDirectory ? '' : formatFileSize(item.size);
    const dateText = item.mtime ? new Date(item.mtime).toLocaleString('id-ID') : '-';

    let actionBtns = '';
    if (item.isDirectory) {
      actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}', true)">Buka 📂</button>`;
      actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); shareLink('${escapeJsStr(itemSubpath)}', true)">Share 🔗</button>`;
      actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); downloadZip('${escapeJsStr(itemSubpath)}')">.ZIP 📦</button>`;
    } else {
      if (canPreview(item.extension)) {
        actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); previewFile('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}', '${item.extension}')">Lihat 👁️</button>`;
      }
      actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); shareLink('${escapeJsStr(itemSubpath)}', false)">Share 🔗</button>`;
      actionBtns += `<button class="btn-icon" onclick="event.stopPropagation(); downloadFile('${escapeJsStr(itemSubpath)}')">Unduh ⬇️</button>`;
    }
    actionBtns += `<button class="btn-icon" style="color:var(--win-danger);" onclick="event.stopPropagation(); deleteItem('${escapeJsStr(itemSubpath)}')">🗑️</button>`;

    tr.innerHTML = `
      <td class="col-name">
        <a href="javascript:void(0)" class="file-row-name" onclick="${item.isDirectory ? `loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}', true)` : `previewFile('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}', '${item.extension}')`}">
          <span class="file-item-icon">${icon}</span>
          <span>${escapeHtml(item.name)}</span>
        </a>
      </td>
      <td class="col-mtime" style="color: var(--win-text-muted);">${dateText}</td>
      <td class="col-type" style="color: var(--win-text-muted);">${typeName}</td>
      <td class="col-size" style="color: var(--win-text-muted);">${sizeText}</td>
      <td class="col-actions" style="text-align: right;"><div class="row-actions" style="justify-content: flex-end;">${actionBtns}</div></td>
    `;

    tbody.appendChild(tr);
  });
}

// Table Sort Handler
function handleSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

  // Update table header sort icons
  ['name', 'mtime', 'type', 'size'].forEach(col => {
    const iconSpan = document.getElementById(`sort-icon-${col}`);
    if (iconSpan) {
      if (col === sortColumn) {
        iconSpan.innerText = sortDirection === 'asc' ? '🔼' : '🔽';
      } else {
        iconSpan.innerText = '';
      }
    }
  });

  renderFileTable(currentItems);
}

// Navigation History Functions
function goBack() {
  if (historyIndex > 0) {
    historyIndex--;
    const state = navHistory[historyIndex];
    loadFolderContents(state.folderId, state.subpath, false);
  }
}

function goForward() {
  if (historyIndex < navHistory.length - 1) {
    historyIndex++;
    const state = navHistory[historyIndex];
    loadFolderContents(state.folderId, state.subpath, false);
  }
}

function goUp() {
  if (!currentSubpath) return;
  const parts = currentSubpath.split(/[\/\\]/).filter(p => p.length > 0);
  parts.pop();
  const parentSubpath = parts.join('/');
  loadFolderContents(currentFolderId, parentSubpath, true);
}

function refreshCurrentFolder() {
  if (currentFolderId) {
    loadFolderContents(currentFolderId, currentSubpath, false);
  }
}

function updateNavButtonsState() {
  document.getElementById('btn-nav-back').disabled = historyIndex <= 0;
  document.getElementById('btn-nav-forward').disabled = historyIndex >= navHistory.length - 1;
  document.getElementById('btn-nav-up').disabled = !currentSubpath;
}

function updateSidebarActiveItem(folderId) {
  const items = document.querySelectorAll('.sidebar-item');
  items.forEach(item => {
    if (item.dataset.id === folderId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// File Actions
function downloadFile(subpath) {
  const url = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
  window.open(url, '_blank');
}

function downloadZip(subpath) {
  const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(subpath)}`;
  window.open(url, '_blank');
}

async function deleteItem(subpath) {
  if (!confirm(`Apakah Anda yakin ingin menghapus "${subpath}"?`)) return;

  // Stop any active media preview stream to release file handle on Windows
  const previewModal = document.getElementById('modal-preview');
  if (previewModal && previewModal.classList.contains('active')) {
    const container = document.getElementById('preview-container');
    if (container) container.innerHTML = '';
    closeModal('modal-preview');
  }

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/delete?subpath=${encodeURIComponent(subpath)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      await loadFolderContents(currentFolderId, currentSubpath, false);
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

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
      await loadFolderContents(currentFolderId, currentSubpath, false);
      await buildSidebarFolderTree(currentFolderId);
    } else {
      alert('Gagal membuat folder: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function uploadFiles(files) {
  if (!currentFolderId || !files || files.length === 0) return;

  isUploadCompleted = false;

  const btnFloat = document.getElementById('btn-float-upload');
  const iconFloat = document.getElementById('float-upload-icon');
  const badgeFloat = document.getElementById('float-upload-badge');

  const detailTitle = document.getElementById('upload-detail-title');
  const detailStatusText = document.getElementById('upload-detail-status-text');
  const detailPercent = document.getElementById('upload-detail-percent');
  const detailBar = document.getElementById('upload-detail-bar');
  const detailSizeText = document.getElementById('upload-detail-size-text');
  const detailFileCount = document.getElementById('upload-detail-file-count');
  const fileListContainer = document.getElementById('upload-file-list');

  // Calculate total payload size
  let totalBytes = 0;
  const fileArray = Array.from(files);
  fileArray.forEach(f => totalBytes += (f.size || 0));

  // Initialize Floating Widget State
  if (btnFloat) {
    btnFloat.style.display = 'flex';
    btnFloat.classList.remove('success');
  }
  if (iconFloat) {
    iconFloat.innerText = '📤';
  }
  if (badgeFloat) {
    badgeFloat.innerText = '0%';
  }

  // Initialize Detail Modal UI
  if (detailTitle) detailTitle.innerText = '📤 Status Pengunggahan Berkas';
  if (detailStatusText) detailStatusText.innerText = 'Mengunggah berkas...';
  if (detailPercent) detailPercent.innerText = '0%';
  if (detailBar) detailBar.style.width = '0%';
  if (detailSizeText) detailSizeText.innerText = `0 B / ${formatFileSize(totalBytes)}`;
  if (detailFileCount) detailFileCount.innerText = `${fileArray.length} File`;

  // Render file list items in detail modal
  if (fileListContainer) {
    fileListContainer.innerHTML = '';
    fileArray.forEach((f, index) => {
      const fileNameStr = f.webkitRelativePath || f.name;
      const itemEl = document.createElement('div');
      itemEl.className = 'upload-file-item';
      itemEl.id = `upload-item-${index}`;
      itemEl.innerHTML = `
        <span class="upload-file-name" title="${escapeHtml(fileNameStr)}">
          📄 ${escapeHtml(fileNameStr)}
        </span>
        <span class="upload-file-status" id="upload-status-${index}">⏳ Mengunggah...</span>
      `;
      fileListContainer.appendChild(itemEl);
    });
  }

  // Prepare FormData
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    formData.append('files', file);
    if (file.webkitRelativePath) {
      formData.append('relativePath', file.webkitRelativePath);
    }
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/folders/${currentFolderId}/upload?subpath=${encodeURIComponent(currentSubpath)}`);

  // XHR Progress Handler
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      if (pct >= 100) {
        if (badgeFloat) badgeFloat.innerText = 'Memproses...';
        if (detailPercent) detailPercent.innerText = '99%';
        if (detailBar) detailBar.style.width = '99%';
        if (detailStatusText) detailStatusText.innerText = 'Menyimpan berkas di server...';
      } else {
        if (badgeFloat) badgeFloat.innerText = `${pct}%`;
        if (detailPercent) detailPercent.innerText = `${pct}%`;
        if (detailBar) detailBar.style.width = `${pct}%`;
        if (detailStatusText) detailStatusText.innerText = 'Mengunggah berkas...';
      }
      if (detailSizeText) detailSizeText.innerText = `${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`;
    }
  };

  // XHR Completion Handler
  xhr.onload = async () => {
    if (xhr.status === 200) {
      isUploadCompleted = true;
      if (btnFloat) btnFloat.classList.add('success');
      if (iconFloat) {
        iconFloat.innerText = '✅';
      }
      if (badgeFloat) badgeFloat.innerText = 'Upload Berhasil';

      if (detailTitle) detailTitle.innerText = '✅ Pengunggahan Selesai';
      if (detailStatusText) detailStatusText.innerText = 'Semua berkas telah berhasil diunggah!';
      if (detailPercent) detailPercent.innerText = '100%';
      if (detailBar) detailBar.style.width = '100%';
      if (detailSizeText) detailSizeText.innerText = `${formatFileSize(totalBytes)} / ${formatFileSize(totalBytes)}`;

      fileArray.forEach((_, index) => {
        const statusEl = document.getElementById(`upload-status-${index}`);
        if (statusEl) {
          statusEl.innerText = '✅ Berhasil';
          statusEl.className = 'upload-file-status success';
        }
      });

      await loadFolderContents(currentFolderId, currentSubpath, false);
    } else {
      let errMsg = 'Server Error';
      try {
        const response = JSON.parse(xhr.responseText);
        if (response.error) errMsg = response.error;
      } catch (err) {}

      if (iconFloat) {
        iconFloat.innerText = '❌';
      }
      if (badgeFloat) badgeFloat.innerText = 'Gagal';
      if (detailStatusText) detailStatusText.innerText = 'Gagal mengunggah: ' + errMsg;

      fileArray.forEach((_, index) => {
        const statusEl = document.getElementById(`upload-status-${index}`);
        if (statusEl) {
          statusEl.innerText = '❌ Gagal';
          statusEl.className = 'upload-file-status error';
        }
      });
    }
  };

  xhr.onerror = () => {
    if (iconFloat) {
      iconFloat.innerText = '❌';
    }
    if (badgeFloat) badgeFloat.innerText = 'Error';
    if (detailStatusText) detailStatusText.innerText = 'Terjadi kesalahan koneksi jaringan.';
  };

  xhr.send(formData);
}

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
      await loadFolderContents(folderId, '', true);
    } else {
      alert(data.message || 'OTP salah!');
    }
  } catch (err) {
    alert('Gagal verifikasi OTP: ' + err.message);
  }
}

// Helpers
function getFileTypeName(item) {
  if (item.isDirectory) return 'Folder File';
  const ext = (item.extension || '').toLowerCase();
  const map = {
    '.jpg': 'Gambar JPEG', '.jpeg': 'Gambar JPEG', '.png': 'Gambar PNG', '.gif': 'Gambar GIF', '.svg': 'Gambar SVG', '.webp': 'Gambar WebP',
    '.mp4': 'Video MP4', '.webm': 'Video WebM', '.mkv': 'Video MKV', '.avi': 'Video AVI',
    '.mp3': 'Audio MP3', '.wav': 'Audio WAV', '.ogg': 'Audio OGG',
    '.pdf': 'Dokumen PDF',
    '.doc': 'Dokumen Word', '.docx': 'Dokumen Word',
    '.xls': 'Lembar Kerja Excel', '.xlsx': 'Lembar Kerja Excel',
    '.ppt': 'Presentasi PowerPoint', '.pptx': 'Presentasi PowerPoint',
    '.txt': 'Berkas Teks', '.json': 'Berkas JSON', '.csv': 'Berkas CSV',
    '.zip': 'Arsip ZIP', '.rar': 'Arsip RAR', '.7z': 'Arsip 7-Zip'
  };
  return map[ext] || `Berkas ${ext.replace('.', '').toUpperCase() || 'File'}`;
}

function canPreview(ext) {
  const mediaExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.txt', '.json', '.md'];
  return mediaExts.includes((ext || '').toLowerCase());
}

// Share original physical file binary directly via Web Share API Level 2 (WhatsApp/System share)
async function shareOriginalFile(subpath, filename) {
  const fileUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
  const btnFileShare = document.getElementById('btn-share-file');
  const originalText = btnFileShare ? btnFileShare.innerText : '';
  
  try {
    if (btnFileShare) btnFileShare.innerText = '⏳ Memuat berkas fisik...';

    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error('Gagal mengunduh berkas dari server');
    
    const blob = await res.blob();
    const mimeType = blob.type || 'application/octet-stream';
    const fileObj = new File([blob], filename, { type: mimeType });

    if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
      if (btnFileShare) btnFileShare.innerText = originalText;
      await navigator.share({
        title: filename,
        text: 'Mengirimkan berkas asli:',
        files: [fileObj]
      });
    } else {
      if (btnFileShare) btnFileShare.innerText = originalText;
      alert('Perangkat/Browser ini tidak mendukung pengiriman berkas fisik secara langsung. Silakan gunakan tombol "Bagikan Tautan/URL" atau unduh berkas terlebih dahulu.');
    }
  } catch (err) {
    if (btnFileShare) btnFileShare.innerText = originalText;
    if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
      alert('Gagal membagikan berkas fisik: ' + err.message);
    }
  }
}

// Share link helper function with Social Media integration
function shareLink(subpath, isDirectory = false, filename = '') {
  const name = filename || subpath.split(/[\/\\]/).pop() || 'Berkas Shared';
  const baseUrl = (currentSystemInfo && currentSystemInfo.primaryIp) ? 
    `http://${currentSystemInfo.primaryIp}:${currentSystemInfo.port}` : window.location.origin;
  
  let fullUrl = '';
  if (isDirectory) {
    fullUrl = `${baseUrl}/#folder=${currentFolderId}&subpath=${encodeURIComponent(subpath)}`;
  } else {
    fullUrl = `${baseUrl}/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
  }
  
  const nameEl = document.getElementById('share-target-name');
  const urlEl = document.getElementById('share-target-url');
  if (nameEl) nameEl.innerText = name;
  if (urlEl) urlEl.innerText = fullUrl;

  // Direct Original Physical File Share Button
  const btnFileShare = document.getElementById('btn-share-file');
  if (btnFileShare) {
    if (!isDirectory) {
      btnFileShare.style.display = 'inline-flex';
      btnFileShare.onclick = () => shareOriginalFile(subpath, name);
    } else {
      btnFileShare.style.display = 'none';
    }
  }

  // WhatsApp share link
  const waText = encodeURIComponent(`📁 *Lihat berkas di ShareDrive LAN*:\n*${name}*\n${fullUrl}`);
  const btnWa = document.getElementById('btn-share-wa');
  if (btnWa) {
    btnWa.onclick = () => {
      window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
    };
  }

  // Telegram share link
  const btnTg = document.getElementById('btn-share-tg');
  if (btnTg) {
    btnTg.onclick = () => {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(fullUrl)}&text=${encodeURIComponent('Lihat berkas: ' + name)}`, '_blank');
    };
  }

  // Native Mobile System Share
  const btnNative = document.getElementById('btn-share-native');
  if (btnNative) {
    if (navigator.share) {
      btnNative.style.display = 'inline-flex';
      btnNative.onclick = () => {
        navigator.share({
          title: name,
          text: 'Lihat berkas di ShareDrive Intranet:',
          url: fullUrl
        }).catch(err => console.log('Share canceled'));
      };
    } else {
      btnNative.style.display = 'none';
    }
  }

  // Copy Link button
  const btnCopy = document.getElementById('btn-share-copy');
  if (btnCopy) {
    btnCopy.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl).then(() => {
          alert('✅ Link berhasil disalin ke clipboard:\n' + fullUrl);
        }).catch(() => {
          prompt('Salin link di bawah ini:', fullUrl);
        });
      } else {
        prompt('Salin link di bawah ini:', fullUrl);
      }
    };
  }

  openModal('modal-share');
}

function previewFile(subpath, filename, ext) {
  const container = document.getElementById('preview-container');
  container.innerHTML = '';
  document.getElementById('preview-filename').innerText = filename;

  // Bind download & share buttons inside modal
  const btnDownloadModal = document.getElementById('btn-modal-download');
  if (btnDownloadModal) {
    btnDownloadModal.onclick = () => downloadFile(subpath);
  }

  const btnShareModal = document.getElementById('btn-modal-share');
  if (btnShareModal) {
    btnShareModal.onclick = () => shareLink(subpath, false);
  }

  const fileUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}&preview=1`;
  const lowerExt = (ext || '').toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(lowerExt)) {
    container.innerHTML = `<img src="${fileUrl}" alt="${escapeHtml(filename)}">`;
  } else if (['.mp4', '.webm'].includes(lowerExt)) {
    container.innerHTML = `<video src="${fileUrl}" controls autoplay></video>`;
  } else if (['.mp3', '.wav'].includes(lowerExt)) {
    container.innerHTML = `<audio src="${fileUrl}" controls autoplay></audio>`;
  } else if (lowerExt === '.pdf') {
    container.innerHTML = `<iframe src="${fileUrl}"></iframe>`;
  } else if (['.txt', '.json', '.md', '.js', '.html', '.css', '.py', '.sh', '.bat', '.cmd', '.xml', '.yaml', '.yml'].includes(lowerExt)) {
    container.innerHTML = `<p style="color:var(--win-text-muted)">Memuat isi teks...</p>`;
    fetch(fileUrl)
      .then(res => res.text())
      .then(text => {
        container.innerHTML = `<pre style="background:var(--win-bg); padding:1rem; border-radius:4px; width:100%; max-height:60vh; overflow:auto; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-break:break-all;">${escapeHtml(text)}</pre>`;
      });
  } else {
    // Non-direct media preview fallback card inside modal
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <div style="font-size: 3.5rem; margin-bottom: 0.75rem;">📄</div>
        <h4 style="margin-bottom: 0.5rem; font-weight: 600;">${escapeHtml(filename)}</h4>
        <p style="color: var(--win-text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">File ini tidak dapat ditampilkan sebagai pratinjau media langsung.</p>
        <div style="display: flex; gap: 0.5rem; justify-content: center;">
          <button class="btn-icon" style="background: var(--win-card); border-color: var(--win-border); padding: 0.6rem 1.25rem; font-size: 0.95rem;" onclick="shareLink('${escapeJsStr(subpath)}', false)">
            🔗 Share Link
          </button>
          <button class="btn-icon" style="background: var(--win-accent-dark); color: #fff; padding: 0.6rem 1.25rem; font-size: 0.95rem;" onclick="downloadFile('${escapeJsStr(subpath)}')">
            ⬇️ Unduh Berkas Ini
          </button>
        </div>
      </div>`;
  }

  openModal('modal-preview');
}

function getFileIcon(item) {
  if (item.isDirectory) return '📁';
  const ext = (item.extension || '').toLowerCase();
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
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    // Push modal state so Hardware Back on HP closes popup modal first
    const hashUrl = `#modal=${encodeURIComponent(id)}`;
    if (window.location.hash !== hashUrl) {
      history.pushState({ modalId: id, folderId: currentFolderId, subpath: currentSubpath }, '', hashUrl);
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el && el.classList.contains('active')) {
    el.classList.remove('active');
  }

  // Auto-hide floating button when upload detail modal is closed after successful upload
  if (id === 'modal-upload-detail' && isUploadCompleted) {
    const btnFloat = document.getElementById('btn-float-upload');
    if (btnFloat) {
      btnFloat.style.display = 'none';
    }
    isUploadCompleted = false;
  }
}

function parseHashUrlAndNavigate() {
  const hash = window.location.hash;
  if (hash && hash.includes('folder=')) {
    const cleanHash = hash.replace(/^#/, '');
    const params = new URLSearchParams(cleanHash);
    const folderId = params.get('folder');
    const subpath = params.get('subpath') || '';
    if (folderId) {
      loadFolderContents(folderId, subpath, false);
      return true;
    }
  }
  return false;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJsStr(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
