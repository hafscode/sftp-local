let currentFolderId = null;
let currentSubpath = '';
let currentFoldersData = [];
let currentItems = [];
let currentSystemInfo = null;

// Global Selection, Clipboard & Search State
let isSearchMode = false;
let selectedItems = new Set();
let clipboard = null;
let activeUploadXHR = null;

// Navigation History Stack
let navHistory = [];
let historyIndex = -1;
let isUploadCompleted = false;

// Sorting state
let sortColumn = 'name'; // 'name', 'mtime', 'type', 'size'
let sortDirection = 'asc'; // 'asc' or 'desc'

// Search state
// View mode state ('table' | 'grid')
let currentViewMode = localStorage.getItem('explorer-view-mode') || 'table';
if (currentViewMode !== 'table' && currentViewMode !== 'grid') {
  currentViewMode = 'table';
}

function setViewMode(mode) {
  if (mode !== 'table' && mode !== 'grid') mode = 'table';
  currentViewMode = mode;
  localStorage.setItem('explorer-view-mode', mode);
  updateViewModeMenuItems();
  renderFileTable(currentItems);
}

function updateViewModeMenuItems() {
  const btnTable = document.getElementById('menu-view-table');
  const btnGrid = document.getElementById('menu-view-grid');
  if (btnTable) {
    btnTable.style.fontWeight = currentViewMode === 'table' ? '700' : '400';
    btnTable.style.color = currentViewMode === 'table' ? 'var(--win-accent)' : 'var(--win-text)';
  }
  if (btnGrid) {
    btnGrid.style.fontWeight = currentViewMode === 'grid' ? '700' : '400';
    btnGrid.style.color = currentViewMode === 'grid' ? 'var(--win-accent)' : 'var(--win-text)';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSystemInfo();
  loadSharedFolders();
  setupEventListeners();
});

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
}

function setupEventListeners() {
  // Theme Toggle Button
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = current === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

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

  // Close modal overlays & dropdown menus when clicking outside
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-dropdown-container')) {
      closeAllRowMenus();
    }
  });

  // Handle Mobile Hardware Back Button / Browser Back Button via HTML5 PopState
  window.addEventListener('popstate', (e) => {
    // 1. If any modal popup is active, close it first!
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      activeModal.classList.remove('active');
      if (window.location.hash.includes('modal=')) {
        const cleanFolderHash = window.location.hash.split('&modal=')[0].split('#modal=')[0];
        const targetHash = cleanFolderHash || `#folder=${encodeURIComponent(currentFolderId || '')}&subpath=${encodeURIComponent(currentSubpath || '')}`;
        history.replaceState({ folderId: currentFolderId, subpath: currentSubpath }, '', targetHash);
      }
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

  // Action Toolbar File Inputs & Upload Buttons
  const fileInputFiles = document.getElementById('file-input-files');
  const fileInputFolder = document.getElementById('file-input-folder');

  document.getElementById('btn-upload-file').addEventListener('click', () => {
    if (fileInputFiles) fileInputFiles.value = '';
    fileInputFiles.click();
  });

  const menuUploadFolder = document.getElementById('menu-upload-folder');
  if (menuUploadFolder) {
    menuUploadFolder.addEventListener('click', () => {
      closeAllRowMenus();
      if (fileInputFolder) fileInputFolder.value = '';
      fileInputFolder.click();
    });
  }

  fileInputFiles.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      e.target.value = '';
      handleFileSelection(files);
    }
  });

  fileInputFolder.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      e.target.value = '';
      handleFileSelection(files);
    }
  });

  // Toolbar Action Cut, Copy, Paste, Delete Buttons
  const btnCutSelected = document.getElementById('btn-cut-selected');
  if (btnCutSelected) btnCutSelected.addEventListener('click', executeCutSelected);

  const btnCopySelected = document.getElementById('btn-copy-selected');
  if (btnCopySelected) btnCopySelected.addEventListener('click', executeCopySelected);

  const btnPaste = document.getElementById('btn-paste');
  if (btnPaste) btnPaste.addEventListener('click', () => executePaste(currentSubpath));

  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  if (btnDeleteSelected) btnDeleteSelected.addEventListener('click', executeBatchDelete);

  // Toolbar More Menu Item Buttons
  const menuViewTable = document.getElementById('menu-view-table');
  if (menuViewTable) {
    menuViewTable.addEventListener('click', () => {
      closeAllRowMenus();
      setViewMode('table');
    });
  }

  const menuViewGrid = document.getElementById('menu-view-grid');
  if (menuViewGrid) {
    menuViewGrid.addEventListener('click', () => {
      closeAllRowMenus();
      setViewMode('grid');
    });
  }
  updateViewModeMenuItems();

  const menuDownloadSelected = document.getElementById('menu-download-selected');
  if (menuDownloadSelected) {
    menuDownloadSelected.addEventListener('click', () => {
      closeAllRowMenus();
      downloadSelectedItems();
    });
  }

  const menuDownloadZipSelected = document.getElementById('menu-download-zip-selected');
  if (menuDownloadZipSelected) {
    menuDownloadZipSelected.addEventListener('click', () => {
      closeAllRowMenus();
      downloadZipSelectedItems();
    });
  }

  const menuDownloadZip = document.getElementById('menu-download-zip');
  if (menuDownloadZip) {
    menuDownloadZip.addEventListener('click', () => {
      closeAllRowMenus();
      if (!currentFolderId) return;
      const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(currentSubpath)}`;
      window.open(url, '_blank');
    });
  }

  const menuCopyPath = document.getElementById('menu-copy-path');
  if (menuCopyPath) {
    menuCopyPath.addEventListener('click', () => {
      closeAllRowMenus();
      copyCurrentPathToClipboard();
    });
  }

  const menuSelectAll = document.getElementById('menu-select-all');
  if (menuSelectAll) {
    menuSelectAll.addEventListener('click', () => {
      closeAllRowMenus();
      toggleSelectAll(true);
    });
  }

  const menuUnselectAll = document.getElementById('menu-unselect-all');
  if (menuUnselectAll) {
    menuUnselectAll.addEventListener('click', () => {
      closeAllRowMenus();
      toggleSelectAll(false);
    });
  }

  // Floating Upload Widget Button Handler
  const btnFloatUpload = document.getElementById('btn-float-upload');
  if (btnFloatUpload) {
    btnFloatUpload.addEventListener('click', () => {
      openModal('modal-upload-detail');
    });
  }

  // Action Toolbar Create Folder Button
  document.getElementById('btn-create-folder').addEventListener('click', () => {
    document.getElementById('new-folder-name').value = '';
    openModal('modal-create-folder');
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

  const formRename = document.getElementById('form-rename');
  if (formRename) {
    formRename.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldSubpath = document.getElementById('rename-old-subpath').value;
      const newName = document.getElementById('rename-input-name').value;
      await renameItem(oldSubpath, newName);
    });
  }

  // External Drag and Drop files onto Main Content Area
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files);
    }
  });
}

// Row & Toolbar Floating Overlay Menu Helpers (Body Portal Pattern)
function toggleRowMenu(btn) {
  const menu = btn.nextElementSibling || btn.parentElement.querySelector('.action-dropdown-menu');
  if (!menu) return;
  const isAlreadyActive = menu.classList.contains('active');
  closeAllRowMenus();

  if (!isAlreadyActive) {
    menu._parentContainer = menu.parentElement;
    menu._parentNextSibling = menu.nextSibling;

    document.body.appendChild(menu);
    menu.classList.add('active');

    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.zIndex = '999999999';

    const menuHeight = menu.offsetHeight || 260;
    const menuWidth = menu.offsetWidth || 160;

    if (rect.bottom + menuHeight > window.innerHeight - 10) {
      menu.style.top = `${Math.max(10, rect.top - menuHeight - 4)}px`;
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
    }

    if (rect.right - menuWidth >= 8) {
      menu.style.left = 'auto';
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    } else {
      menu.style.left = `${Math.max(8, rect.left)}px`;
      menu.style.right = 'auto';
    }
  }
}

function toggleToolbarMoreMenu() {
  const btn = document.getElementById('btn-toolbar-more');
  const menu = document.getElementById('toolbar-more-menu');
  if (!menu || !btn) return;
  const isAlreadyActive = menu.classList.contains('active');
  closeAllRowMenus();

  if (!isAlreadyActive) {
    menu._parentContainer = menu.parentElement;
    menu._parentNextSibling = menu.nextSibling;

    document.body.appendChild(menu);
    menu.classList.add('active');

    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.zIndex = '999999999';

    if (rect.left + 220 > window.innerWidth) {
      menu.style.left = 'auto';
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    } else {
      menu.style.left = `${Math.max(8, rect.left)}px`;
      menu.style.right = 'auto';
    }
  }
}

function togglePreviewMoreMenu() {
  const btn = document.getElementById('btn-modal-more');
  const menu = document.getElementById('preview-more-menu');
  if (!menu || !btn) return;
  const isAlreadyActive = menu.classList.contains('active');
  closeAllRowMenus();

  if (!isAlreadyActive) {
    menu._parentContainer = menu.parentElement;
    menu._parentNextSibling = menu.nextSibling;

    document.body.appendChild(menu);
    menu.classList.add('active');

    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.zIndex = '999999999';

    if (rect.left + 170 > window.innerWidth) {
      menu.style.left = 'auto';
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    } else {
      menu.style.left = `${Math.max(8, rect.left)}px`;
      menu.style.right = 'auto';
    }
  }
}

function closeAllRowMenus() {
  document.querySelectorAll('.action-dropdown-menu.active').forEach(menu => {
    menu.classList.remove('active');
    if (menu._parentContainer) {
      if (menu._parentNextSibling) {
        menu._parentContainer.insertBefore(menu, menu._parentNextSibling);
      } else {
        menu._parentContainer.appendChild(menu);
      }
      menu._parentContainer = null;
      menu._parentNextSibling = null;
    }
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.zIndex = '';
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

    if (data.theme && !localStorage.getItem('app-theme')) {
      applyTheme(data.theme);
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

    const navigatedFromHash = parseHashUrlAndNavigate();
    if (!navigatedFromHash && folders.length > 0 && !currentFolderId) {
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
  selectedItems.clear();
  document.getElementById('search-input').value = '';

  const folder = currentFoldersData.find(f => f.id === folderId);
  updateSidebarActiveItem(folderId);

  if (folder && folder.requiresOtp && !folder.isVerified) {
    document.getElementById('otp-folder-id').value = folderId;
    document.getElementById('otp-input').value = '';
    openModal('modal-otp');
    document.getElementById('file-table-body').innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--win-text-muted);">
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
  selectedItems.clear();

  if (pushHistory) {
    if (historyIndex < navHistory.length - 1) {
      navHistory = navHistory.slice(0, historyIndex + 1);
    }
    navHistory.push({ folderId, subpath });
    historyIndex = navHistory.length - 1;

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
  selectedItems.clear();

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.error) {
      alert('Gagal mencari: ' + data.error);
      return;
    }

    currentItems = data.items || [];
    
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

// Render File Explorer Content (Table View & Grid View)
function renderFileTable(items) {
  const tableView = document.getElementById('file-table-view');
  const gridView = document.getElementById('file-grid-body');
  const tbody = document.getElementById('file-table-body');
  const selectAllCb = document.getElementById('select-all-checkbox');

  if (tbody) tbody.innerHTML = '';
  if (gridView) gridView.innerHTML = '';

  if (currentViewMode === 'grid') {
    if (tableView) tableView.style.display = 'none';
    if (gridView) gridView.style.display = 'grid';
  } else {
    if (tableView) tableView.style.display = 'table';
    if (gridView) gridView.style.display = 'none';
  }

  if (!items || items.length === 0) {
    selectedItems.clear();
    updateToolbarSelectionState();
    if (selectAllCb) selectAllCb.checked = false;

    const emptyContent = `
      <div style="text-align: center; padding: 3rem; color: var(--win-text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
        <p style="margin-bottom: 1rem;">${isSearchMode ? 'Tidak ada file/folder yang cocok dengan pencarian' : 'Folder ini kosong'}</p>
        ${!isSearchMode ? `<button class="btn-icon" style="background: var(--win-accent-dark); color: #fff; padding: 0.55rem 1.25rem;" onclick="document.getElementById('file-input-files').click()">📄 Upload File Ke Sini</button>` : ''}
      </div>`;

    if (currentViewMode === 'grid' && gridView) {
      gridView.innerHTML = `<div style="grid-column: 1 / -1;">${emptyContent}</div>`;
    } else if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6">${emptyContent}</td></tr>`;
    }
    return;
  }

  if (selectAllCb) {
    selectAllCb.checked = items.length > 0 && items.every(i => {
      const sub = i.subpath ? i.subpath : (currentSubpath ? `${currentSubpath}/${i.name}` : i.name);
      return selectedItems.has(sub);
    });
  }

  const sortedItems = [...items].sort((a, b) => {
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

  if (currentViewMode === 'grid' && gridView) {
    renderFileGridView(sortedItems, gridView);
  } else if (tbody) {
    renderFileTableView(sortedItems, tbody);
  }

  updateToolbarSelectionState();
}

function renderFileTableView(sortedItems, tbody) {
  sortedItems.forEach(item => {
    const tr = document.createElement('tr');
    const itemSubpath = item.subpath ? item.subpath : (currentSubpath ? `${currentSubpath}/${item.name}` : item.name);
    const icon = getFileIcon(item, itemSubpath);
    const typeName = getFileTypeName(item);
    const sizeText = item.isDirectory ? '' : formatFileSize(item.size);
    const dateText = item.mtime ? new Date(item.mtime).toLocaleString('id-ID') : '-';
    const isSelected = selectedItems.has(itemSubpath);
    const isCut = clipboard && clipboard.action === 'cut' && clipboard.items.includes(itemSubpath);

    if (isSelected) tr.classList.add('selected-row');
    if (isCut) tr.classList.add('cut-item');

    tr.setAttribute('draggable', 'true');
    tr.dataset.subpath = itemSubpath;
    tr.dataset.isDirectory = item.isDirectory ? 'true' : 'false';

    tr.addEventListener('dragstart', (e) => {
      if (window.lastLongPressTime && (Date.now() - window.lastLongPressTime < 1000)) {
        e.preventDefault();
        return false;
      }
      let dragList = [];
      if (selectedItems.has(itemSubpath)) {
        dragList = Array.from(selectedItems);
      } else {
        dragList = [itemSubpath];
      }
      e.dataTransfer.setData('application/json', JSON.stringify({ items: dragList }));
      e.dataTransfer.setData('text/plain', dragList.join(','));
      e.dataTransfer.effectAllowed = 'move';
    });

    if (item.isDirectory) {
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tr.classList.add('drop-target-active');
      });

      tr.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tr.classList.remove('drop-target-active');
      });

      tr.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        tr.classList.remove('drop-target-active');

        try {
          const rawData = e.dataTransfer.getData('application/json');
          if (rawData) {
            const parsed = JSON.parse(rawData);
            if (parsed.items && Array.isArray(parsed.items)) {
              await moveItemsToFolder(parsed.items, itemSubpath);
            }
          }
        } catch (err) {
          console.error('Drop error:', err);
        }
      });
    }

    attachItemInteractions(tr, itemSubpath, item);

    let actionBtns = '';
    actionBtns += `<button class="btn-icon" title="Edit / Rename" onclick="event.stopPropagation(); promptRename('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}')">✏️</button>`;

    if (item.isDirectory) {
      actionBtns += `<button class="btn-icon" title="Unduh .ZIP" onclick="event.stopPropagation(); downloadZip('${escapeJsStr(itemSubpath)}')">📦</button>`;
    } else {
      actionBtns += `<button class="btn-icon" title="Unduh Berkas" onclick="event.stopPropagation(); downloadFile('${escapeJsStr(itemSubpath)}')">⬇️</button>`;
    }

    actionBtns += `
      <div class="action-dropdown-container">
        <button class="btn-icon btn-more" title="Opsi Lainnya" onclick="event.stopPropagation(); toggleRowMenu(this)">⋮</button>
        <div class="action-dropdown-menu">
          ${item.isDirectory 
            ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}', true)">📂 Buka</button>` 
            : `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); previewFile('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}', '${item.extension}')">👁️ Lihat</button>`}
          ${item.isDirectory 
            ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); downloadZip('${escapeJsStr(itemSubpath)}')">📦 Unduh .ZIP</button>` 
            : `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); downloadFile('${escapeJsStr(itemSubpath)}')">⬇️ Unduh Berkas</button>`}
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); promptRename('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}')">✏️ Edit (Rename)</button>
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); setCutItems(['${escapeJsStr(itemSubpath)}'])">✂️ Cut</button>
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); setCopyItems(['${escapeJsStr(itemSubpath)}'])">📋 Copy</button>
          ${item.isDirectory ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); executePaste('${escapeJsStr(itemSubpath)}')">📥 Paste Ke Folder Ini</button>` : ''}
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); shareLink('${escapeJsStr(itemSubpath)}', ${item.isDirectory ? 'true' : 'false'})">🔗 Share</button>
          <button class="dropdown-item danger" onclick="event.stopPropagation(); closeAllRowMenus(); deleteItem('${escapeJsStr(itemSubpath)}')">🗑️ Hapus</button>
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td class="col-checkbox" style="text-align: center;">
        <input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleRowSelection('${escapeJsStr(itemSubpath)}')">
      </td>
      <td class="col-name">
        <div class="file-row-name">
          <span class="file-item-icon">${icon}</span>
          <span>${escapeHtml(item.name)}</span>
        </div>
      </td>
      <td class="col-mtime" style="color: var(--win-text-muted);">${dateText}</td>
      <td class="col-type" style="color: var(--win-text-muted);">${typeName}</td>
      <td class="col-size" style="color: var(--win-text-muted);">${sizeText}</td>
      <td class="col-actions" style="text-align: right;"><div class="row-actions" style="justify-content: flex-end;">${actionBtns}</div></td>
    `;

    tbody.appendChild(tr);
  });
}

function renderFileGridView(sortedItems, gridContainer) {
  sortedItems.forEach(item => {
    const card = document.createElement('div');
    const itemSubpath = item.subpath ? item.subpath : (currentSubpath ? `${currentSubpath}/${item.name}` : item.name);
    const isSelected = selectedItems.has(itemSubpath);
    const isCut = clipboard && clipboard.action === 'cut' && clipboard.items.includes(itemSubpath);

    card.className = 'grid-item-card';
    if (isSelected) card.classList.add('selected-row');
    if (isCut) card.classList.add('cut-item');

    card.setAttribute('draggable', 'true');
    card.dataset.subpath = itemSubpath;
    card.dataset.isDirectory = item.isDirectory ? 'true' : 'false';

    const ext = (item.extension || '').toLowerCase();
    let thumbHtml = '';
    if (item.isDirectory) {
      thumbHtml = `<div class="grid-item-thumb"><span class="grid-item-emoji">📁</span></div>`;
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext)) {
      const imgUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(itemSubpath)}&preview=1`;
      thumbHtml = `<div class="grid-item-thumb"><img src="${imgUrl}" alt="thumb" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'grid-item-emoji\\'>🖼️</span>';" /></div>`;
    } else if (['.mp4', '.webm', '.mkv', '.avi', '.mov', '.ogg', '.3gp'].includes(ext)) {
      const videoUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(itemSubpath)}`;
      thumbHtml = `<div class="grid-item-thumb"><video src="${videoUrl}#t=0.1" preload="metadata" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid var(--win-border); background: #000; pointer-events: none;" muted onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'grid-item-emoji\\'>🎬</span>';"></video></div>`;
    } else {
      const emojiIcon = getFileEmojiIcon(ext);
      thumbHtml = `<div class="grid-item-thumb"><span class="grid-item-emoji">${emojiIcon}</span></div>`;
    }

    const actionBtns = `
      <div class="action-dropdown-container grid-more-wrapper">
        <button class="btn-icon btn-more" title="Opsi Lainnya" onclick="event.stopPropagation(); toggleRowMenu(this)">⋮</button>
        <div class="action-dropdown-menu">
          ${item.isDirectory 
            ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); loadFolderContents('${currentFolderId}', '${escapeJsStr(itemSubpath)}', true)">📂 Buka</button>` 
            : `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); previewFile('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}', '${item.extension}')">👁️ Lihat</button>`}
          ${item.isDirectory 
            ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); downloadZip('${escapeJsStr(itemSubpath)}')">📦 Unduh .ZIP</button>` 
            : `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); downloadFile('${escapeJsStr(itemSubpath)}')">⬇️ Unduh Berkas</button>`}
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); promptRename('${escapeJsStr(itemSubpath)}', '${escapeJsStr(item.name)}')">✏️ Edit (Rename)</button>
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); setCutItems(['${escapeJsStr(itemSubpath)}'])">✂️ Cut</button>
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); setCopyItems(['${escapeJsStr(itemSubpath)}'])">📋 Copy</button>
          ${item.isDirectory ? `<button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); executePaste('${escapeJsStr(itemSubpath)}')">📥 Paste Ke Folder Ini</button>` : ''}
          <button class="dropdown-item" onclick="event.stopPropagation(); closeAllRowMenus(); shareLink('${escapeJsStr(itemSubpath)}', ${item.isDirectory ? 'true' : 'false'})">🔗 Share</button>
          <button class="dropdown-item danger" onclick="event.stopPropagation(); closeAllRowMenus(); deleteItem('${escapeJsStr(itemSubpath)}')">🗑️ Hapus</button>
        </div>
      </div>
    `;

    card.innerHTML = `
      <div class="grid-checkbox-wrapper">
        <input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleRowSelection('${escapeJsStr(itemSubpath)}')">
      </div>
      ${actionBtns}
      ${thumbHtml}
      <div class="grid-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
    `;

    card.addEventListener('dragstart', (e) => {
      if (window.lastLongPressTime && (Date.now() - window.lastLongPressTime < 1000)) {
        e.preventDefault();
        return false;
      }
      let dragList = [];
      if (selectedItems.has(itemSubpath)) {
        dragList = Array.from(selectedItems);
      } else {
        dragList = [itemSubpath];
      }
      e.dataTransfer.setData('application/json', JSON.stringify({ items: dragList }));
      e.dataTransfer.setData('text/plain', dragList.join(','));
      e.dataTransfer.effectAllowed = 'move';
    });

    if (item.isDirectory) {
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add('drop-target-active');
      });

      card.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drop-target-active');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drop-target-active');

        try {
          const rawData = e.dataTransfer.getData('application/json');
          if (rawData) {
            const parsed = JSON.parse(rawData);
            if (parsed.items && Array.isArray(parsed.items)) {
              await moveItemsToFolder(parsed.items, itemSubpath);
            }
          }
        } catch (err) {
          console.error('Drop error:', err);
        }
      });
    }

    attachItemInteractions(card, itemSubpath, item);

    gridContainer.appendChild(card);
  });
}

// Attach Long Press & Click Interactions for Item Selection
function attachItemInteractions(el, itemSubpath, item) {
  let longPressTimer = null;
  let isLongPressTriggered = false;
  let startX = 0;
  let startY = 0;

  function startPress(e) {
    if (e.button === 2 || e.target.closest('.row-actions') || e.target.closest('.grid-more-wrapper') || e.target.closest('.action-dropdown-container') || e.target.closest('button') || e.target.closest('input')) {
      return;
    }

    isLongPressTriggered = false;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;

    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      isLongPressTriggered = true;
      window.lastLongPressTime = Date.now();
      if (!selectedItems.has(itemSubpath)) {
        selectedItems.add(itemSubpath);
        renderFileTable(currentItems);
      }
    }, 500);
  }

  function movePress(e) {
    if (!longPressTimer) return;
    const currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    if (Math.hypot(currentX - startX, currentY - startY) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function cancelPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  // Prevent default contextmenu popup on long-press (mobile Safari / Chrome)
  el.addEventListener('contextmenu', (e) => {
    if (isLongPressTriggered || (window.lastLongPressTime && (Date.now() - window.lastLongPressTime < 1000))) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  el.addEventListener('touchstart', startPress, { passive: true });
  el.addEventListener('touchmove', movePress, { passive: true });
  el.addEventListener('touchend', cancelPress);
  el.addEventListener('touchcancel', cancelPress);

  el.addEventListener('mousedown', startPress);
  el.addEventListener('mousemove', movePress);
  el.addEventListener('mouseup', cancelPress);
  el.addEventListener('mouseleave', cancelPress);

  el.addEventListener('click', (e) => {
    if (e.target.closest('.row-actions') || e.target.closest('.grid-more-wrapper') || e.target.closest('.action-dropdown-container') || e.target.closest('button') || e.target.closest('input')) {
      return;
    }

    if (isLongPressTriggered || (window.lastLongPressTime && (Date.now() - window.lastLongPressTime < 500))) {
      isLongPressTriggered = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // IF SELECTION MODE IS ACTIVE (> 0 items selected): Single click toggles selection
    if (selectedItems.size > 0) {
      toggleRowSelection(itemSubpath);
      return;
    }

    // IF SELECTION MODE IS INACTIVE (0 items selected): Single click opens/previews
    if (item.isDirectory) {
      loadFolderContents(currentFolderId, itemSubpath, true);
    } else {
      previewFile(itemSubpath, item.name, item.extension, item);
    }
  });

  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('.row-actions') || e.target.closest('.grid-more-wrapper') || e.target.closest('.action-dropdown-container') || e.target.closest('button') || e.target.closest('input')) {
      return;
    }
    if (item.isDirectory) {
      loadFolderContents(currentFolderId, itemSubpath, true);
    } else {
      previewFile(itemSubpath, item.name, item.extension, item);
    }
  });
}

function getFileEmojiIcon(ext) {
  const lower = (ext || '').toLowerCase();
  if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(lower)) return '🎬';
  if (['.mp3', '.wav', '.ogg', '.flac'].includes(lower)) return '🎵';
  if (lower === '.pdf') return '📄';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(lower)) return '📦';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(lower)) return '📝';
  if (['.txt', '.json', '.js', '.css', '.html', '.md', '.py'].includes(lower)) return '💻';
  return '📄';
}

// Table Row Selection & Toolbar State Management
function toggleRowSelection(subpath) {
  if (selectedItems.has(subpath)) {
    selectedItems.delete(subpath);
  } else {
    selectedItems.add(subpath);
  }
  renderFileTable(currentItems);
}

function toggleSelectAll(checked) {
  if (checked) {
    currentItems.forEach(i => {
      const sub = i.subpath ? i.subpath : (currentSubpath ? `${currentSubpath}/${i.name}` : i.name);
      selectedItems.add(sub);
    });
  } else {
    selectedItems.clear();
  }
  renderFileTable(currentItems);
}

function updateToolbarSelectionState() {
  const count = selectedItems.size;
  const btnCut = document.getElementById('btn-cut-selected');
  const btnCopy = document.getElementById('btn-copy-selected');
  const btnPaste = document.getElementById('btn-paste');
  const btnDelete = document.getElementById('btn-delete-selected');
  const badge = document.getElementById('selected-count-badge');

  if (count > 0) {
    document.body.classList.add('selection-mode-active');
  } else {
    document.body.classList.remove('selection-mode-active');
  }

  if (btnCut) btnCut.disabled = count === 0;
  if (btnCopy) btnCopy.disabled = count === 0;
  if (btnDelete) btnDelete.disabled = count === 0;

  if (btnPaste) {
    btnPaste.disabled = !clipboard || !clipboard.items || clipboard.items.length === 0;
  }

  if (badge) {
    if (count > 0) {
      badge.style.display = 'inline-flex';
      badge.innerText = `${count} dipilih`;
    } else {
      badge.style.display = 'none';
    }
  }

  const statusSelectionInfo = document.getElementById('status-selection-info');
  if (statusSelectionInfo) {
    if (count > 0) {
      let selectedBytes = 0;
      selectedItems.forEach(subpath => {
        const item = currentItems.find(i => (i.subpath === subpath || (currentSubpath ? `${currentSubpath}/${i.name}` : i.name) === subpath));
        if (item && !item.isDirectory) {
          selectedBytes += (item.size || 0);
        }
      });
      statusSelectionInfo.innerText = `${count} dipilih (${formatFileSize(selectedBytes)})`;
    } else {
      statusSelectionInfo.innerText = 'Intranet LAN Ready';
    }
  }

  const btnModalPaste = document.getElementById('btn-modal-paste');
  if (btnModalPaste) {
    btnModalPaste.style.display = (clipboard && clipboard.items && clipboard.items.length > 0) ? 'flex' : 'none';
  }
}

// Cut / Copy / Paste / Batch Actions
function setCutItems(itemsArray) {
  if (!itemsArray || itemsArray.length === 0) return;
  clipboard = {
    action: 'cut',
    folderId: currentFolderId,
    items: itemsArray
  };
  updateToolbarSelectionState();
  renderFileTable(currentItems);
}

function setCopyItems(itemsArray) {
  if (!itemsArray || itemsArray.length === 0) return;
  clipboard = {
    action: 'copy',
    folderId: currentFolderId,
    items: itemsArray
  };
  updateToolbarSelectionState();
  renderFileTable(currentItems);
}

function executeCutSelected() {
  if (selectedItems.size === 0) return;
  setCutItems(Array.from(selectedItems));
}

function executeCopySelected() {
  if (selectedItems.size === 0) return;
  setCopyItems(Array.from(selectedItems));
}

// Execute Paste with conflict popup checking
async function executePaste(targetSubpath = currentSubpath) {
  if (!clipboard || !clipboard.items || clipboard.items.length === 0) return;
  if (!currentFolderId) return;

  try {
    const resCheck = await fetch(`/api/folders/${currentFolderId}/check-paste-exists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: clipboard.items,
        targetSubpath: targetSubpath
      })
    });
    const checkData = await resCheck.json();

    if (checkData.existing && checkData.existing.length > 0) {
      const conflictListEl = document.getElementById('conflict-file-list');
      if (conflictListEl) {
        conflictListEl.innerHTML = checkData.existing.map(f => `<div>📄 <strong>${escapeHtml(f)}</strong></div>`).join('');
      }

      const btnRename = document.getElementById('btn-conflict-rename');
      const btnReplace = document.getElementById('btn-conflict-replace');

      if (btnRename) {
        btnRename.onclick = () => {
          closeModal('modal-upload-conflict');
          executePasteConfirmed(targetSubpath, 'rename');
        };
      }

      if (btnReplace) {
        btnReplace.onclick = () => {
          closeModal('modal-upload-conflict');
          executePasteConfirmed(targetSubpath, 'replace');
        };
      }

      openModal('modal-upload-conflict');
    } else {
      executePasteConfirmed(targetSubpath, 'rename');
    }
  } catch (err) {
    console.error('Error checking paste conflicts:', err);
    executePasteConfirmed(targetSubpath, 'rename');
  }
}

async function executePasteConfirmed(targetSubpath, conflictAction = 'rename') {
  if (!clipboard || !clipboard.items || clipboard.items.length === 0) return;
  if (!currentFolderId) return;

  const endpoint = clipboard.action === 'cut' ? 'move' : 'copy';
  try {
    const res = await fetch(`/api/folders/${currentFolderId}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: clipboard.items,
        targetSubpath: targetSubpath,
        conflictAction: conflictAction
      })
    });
    const data = await res.json();
    if (data.success) {
      if (clipboard.action === 'cut') {
        clipboard = null;
      }
      selectedItems.clear();
      await loadFolderContents(currentFolderId, currentSubpath, false);
      await buildSidebarFolderTree(currentFolderId);
    } else {
      alert(`Gagal ${endpoint === 'move' ? 'memindahkan' : 'menyalin'}: ` + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Download Selected Items individually sequentially
function downloadSelectedItems() {
  if (selectedItems.size === 0) {
    alert('Silakan pilih file/folder terlebih dahulu untuk diunduh.');
    return;
  }
  const itemsArray = Array.from(selectedItems);
  itemsArray.forEach((subpath, index) => {
    setTimeout(() => {
      const item = currentItems.find(i => (i.subpath === subpath || i.name === subpath.split(/[\/\\]/).pop()));
      const url = (item && item.isDirectory)
        ? `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(subpath)}`
        : `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
      triggerDirectDownload(url);
    }, index * 350);
  });
}

// Download Selected Items bundled into a ZIP file
async function downloadZipSelectedItems() {
  if (selectedItems.size === 0) {
    alert('Silakan pilih file/folder terlebih dahulu untuk diunduh sebagai ZIP.');
    return;
  }
  if (!currentFolderId) return;

  const itemsArray = Array.from(selectedItems);
  try {
    const res = await fetch(`/api/folders/${currentFolderId}/download-selected-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsArray })
    });

    if (!res.ok) {
      const text = await res.text();
      alert('Gagal mengunduh ZIP: ' + text);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected_files_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Gagal mengunduh ZIP terpilih: ' + err.message);
  }
}

async function executeBatchDelete() {
  if (selectedItems.size === 0) return;
  const itemsArray = Array.from(selectedItems);
  if (!confirm(`Apakah Anda yakin ingin menghapus ${itemsArray.length} item yang dipilih?`)) return;

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsArray })
    });
    const data = await res.json();
    if (data.success) {
      selectedItems.clear();
      await loadFolderContents(currentFolderId, currentSubpath, false);
    } else {
      alert('Gagal menghapus: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function moveItemsToFolder(sourceItems, targetFolderSubpath) {
  if (!sourceItems || sourceItems.length === 0 || !currentFolderId) return;
  try {
    const res = await fetch(`/api/folders/${currentFolderId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: sourceItems,
        targetSubpath: targetFolderSubpath,
        conflictAction: 'rename'
      })
    });
    const data = await res.json();
    if (data.success) {
      selectedItems.clear();
      await loadFolderContents(currentFolderId, currentSubpath, false);
      await buildSidebarFolderTree(currentFolderId);
    } else {
      alert('Gagal memindahkan: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function copyCurrentPathToClipboard() {
  const fullPath = `/${currentFolderId}/${currentSubpath}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullPath).then(() => {
      alert('✅ Path folder berhasil disalin ke clipboard:\n' + fullPath);
    }).catch(() => {
      prompt('Salin path di bawah ini:', fullPath);
    });
  } else {
    prompt('Salin path di bawah ini:', fullPath);
  }
}

// Display File Details Modal
function showFileDetail(previewObj) {
  if (!previewObj) return;
  closeAllRowMenus();
  
  const nameEl = document.getElementById('detail-file-name');
  const pathEl = document.getElementById('detail-file-path');
  const sizeEl = document.getElementById('detail-file-size');
  const typeEl = document.getElementById('detail-file-type');
  const mtimeEl = document.getElementById('detail-file-mtime');
  const btnGotoFolder = document.getElementById('btn-goto-folder');

  const item = previewObj.item || {};
  const fullSubpath = previewObj.subpath || '';

  if (nameEl) nameEl.innerText = previewObj.filename || item.name || '-';
  if (pathEl) pathEl.innerText = `/${currentFolderId}/${fullSubpath}`;
  if (sizeEl) sizeEl.innerText = item.isDirectory ? '-' : formatFileSize(item.size);
  if (typeEl) typeEl.innerText = getFileTypeName(item);
  if (mtimeEl) mtimeEl.innerText = item.mtime ? new Date(item.mtime).toLocaleString('id-ID') : '-';

  if (btnGotoFolder) {
    btnGotoFolder.onclick = () => {
      goToFolderAndSelectFile(fullSubpath);
    };
  }

  openModal('modal-file-detail');
}

// Navigate to File Parent Folder Location & Select File
async function goToFolderAndSelectFile(subpath) {
  if (!subpath || !currentFolderId) return;

  closeModal('modal-file-detail');
  closeModal('modal-preview');
  closeAllRowMenus();

  const parts = subpath.split(/[\/\\]/).filter(p => p.length > 0);
  parts.pop();
  const parentSubpath = parts.join('/');

  await loadFolderContents(currentFolderId, parentSubpath, true);

  selectedItems.clear();
  selectedItems.add(subpath);
  renderFileTable(currentItems);

  setTimeout(() => {
    const rowEl = document.querySelector(`tr[data-subpath="${escapeJsStr(subpath)}"]`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

// Table Sort Handler
function handleSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

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
function triggerDirectDownload(url) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
  }, 10000);
}

function downloadFile(subpath) {
  const url = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
  triggerDirectDownload(url);
}

function downloadZip(subpath) {
  const url = `/api/folders/${currentFolderId}/download-zip?subpath=${encodeURIComponent(subpath)}`;
  triggerDirectDownload(url);
}

async function deleteItem(subpath) {
  if (!confirm(`Apakah Anda yakin ingin menghapus "${subpath}"?`)) return;

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
      selectedItems.delete(subpath);
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

function promptRename(subpath, currentName) {
  const oldSubpathInput = document.getElementById('rename-old-subpath');
  const renameInput = document.getElementById('rename-input-name');
  if (oldSubpathInput && renameInput) {
    oldSubpathInput.value = subpath;
    renameInput.value = currentName;
    openModal('modal-rename');
    setTimeout(() => {
      renameInput.focus();
      const dotIndex = currentName.lastIndexOf('.');
      if (dotIndex > 0) {
        renameInput.setSelectionRange(0, dotIndex);
      } else {
        renameInput.select();
      }
    }, 100);
  }
}

async function renameItem(oldSubpath, newName) {
  if (!currentFolderId || !newName || !newName.trim()) return;

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subpath: oldSubpath,
        newName: newName.trim()
      })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modal-rename');
      await loadFolderContents(currentFolderId, currentSubpath, false);
      await buildSidebarFolderTree(currentFolderId);
    } else {
      alert('Gagal mengubah nama: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function handleFileSelection(files) {
  if (!currentFolderId || !files || files.length === 0) return;

  const filesArray = Array.from(files);
  const filenames = filesArray.map(f => f.webkitRelativePath || f.name);

  try {
    const res = await fetch(`/api/folders/${currentFolderId}/check-exists?subpath=${encodeURIComponent(currentSubpath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames })
    });

    if (res.status === 401) {
      uploadFiles(filesArray, 'replace');
      return;
    }

    const data = await res.json();

    if (data.existing && data.existing.length > 0) {
      const conflictListEl = document.getElementById('conflict-file-list');
      if (conflictListEl) {
        conflictListEl.innerHTML = data.existing.map(f => `<div>📄 <strong>${escapeHtml(f)}</strong></div>`).join('');
      }

      const btnRename = document.getElementById('btn-conflict-rename');
      const btnReplace = document.getElementById('btn-conflict-replace');

      if (btnRename) {
        btnRename.onclick = () => {
          closeModal('modal-upload-conflict');
          uploadFiles(filesArray, 'rename');
        };
      }

      if (btnReplace) {
        btnReplace.onclick = () => {
          closeModal('modal-upload-conflict');
          uploadFiles(filesArray, 'replace');
        };
      }

      openModal('modal-upload-conflict');
    } else {
      uploadFiles(filesArray, 'replace');
    }
  } catch (err) {
    console.error('Error checking existing files:', err);
    uploadFiles(filesArray, 'replace');
  }
}

function cancelUpload() {
  if (activeUploadXhr) {
    activeUploadXhr.abort();
    activeUploadXhr = null;
  }
  const btnCancel = document.getElementById('btn-cancel-upload');
  const detailStatusText = document.getElementById('upload-detail-status-text');
  const detailTitle = document.getElementById('upload-detail-title');
  const iconFloat = document.getElementById('float-upload-icon');
  const badgeFloat = document.getElementById('float-upload-badge');

  if (btnCancel) btnCancel.style.display = 'none';
  if (detailTitle) detailTitle.innerText = '🚫 Pengunggahan Dibatalkan';
  if (detailStatusText) detailStatusText.innerText = 'Pengunggahan telah dibatalkan oleh pengguna.';
  if (iconFloat) iconFloat.innerText = '🚫';
  if (badgeFloat) badgeFloat.innerText = 'Dibatalkan';
}

function uploadFiles(files, conflictAction = 'replace') {
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
  const btnCancelUpload = document.getElementById('btn-cancel-upload');

  let totalBytes = 0;
  const fileArray = Array.from(files);
  fileArray.forEach(f => totalBytes += (f.size || 0));

  if (btnFloat) {
    btnFloat.style.display = 'flex';
    btnFloat.classList.remove('success');
  }
  if (iconFloat) iconFloat.innerText = '📤';
  if (badgeFloat) badgeFloat.innerText = '0%';

  if (detailTitle) detailTitle.innerText = '📤 Status Pengunggahan Berkas';
  if (detailStatusText) detailStatusText.innerText = 'Mengunggah berkas...';
  if (detailPercent) detailPercent.innerText = '0%';
  if (detailBar) detailBar.style.width = '0%';
  if (detailSizeText) detailSizeText.innerText = `0 B / ${formatFileSize(totalBytes)}`;
  if (detailFileCount) detailFileCount.innerText = `${fileArray.length} File`;
  if (btnCancelUpload) btnCancelUpload.style.display = 'inline-flex';

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

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    formData.append('files', file);
    if (file.webkitRelativePath) {
      formData.append('relativePath', file.webkitRelativePath);
    }
  }

  const xhr = new XMLHttpRequest();
  activeUploadXhr = xhr;
  xhr.open('POST', `/api/folders/${currentFolderId}/upload?subpath=${encodeURIComponent(currentSubpath)}&action=${encodeURIComponent(conflictAction)}`);

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

  xhr.onload = async () => {
    activeUploadXhr = null;
    if (btnCancelUpload) btnCancelUpload.style.display = 'none';

    if (xhr.status === 200) {
      isUploadCompleted = true;
      if (btnFloat) btnFloat.classList.add('success');
      if (iconFloat) iconFloat.innerText = '✅';
      if (badgeFloat) badgeFloat.innerText = 'Upload Berhasil';

      if (detailTitle) detailTitle.innerText = '✅ Pengunggahan Selesai';
      if (detailStatusText) detailStatusText.innerText = 'Semua berkas telah berhasil diunggah!';
      if (detailPercent) detailPercent.innerText = '100%';
      if (detailBar) detailBar.style.width = `${formatFileSize(totalBytes)} / ${formatFileSize(totalBytes)}`;

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

      if (iconFloat) iconFloat.innerText = '❌';
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
    activeUploadXhr = null;
    if (btnCancelUpload) btnCancelUpload.style.display = 'none';
    if (iconFloat) iconFloat.innerText = '❌';
    if (badgeFloat) badgeFloat.innerText = 'Error';
    if (detailStatusText) detailStatusText.innerText = 'Terjadi kesalahan koneksi jaringan.';
  };

  xhr.onabort = () => {
    activeUploadXhr = null;
    if (btnCancelUpload) btnCancelUpload.style.display = 'none';
    if (iconFloat) iconFloat.innerText = '🚫';
    if (badgeFloat) badgeFloat.innerText = 'Dibatalkan';
    if (detailTitle) detailTitle.innerText = '🚫 Pengunggahan Dibatalkan';
    if (detailStatusText) detailStatusText.innerText = 'Pengunggahan telah dibatalkan oleh pengguna.';
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
  return true;
}

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

  const btnFileShare = document.getElementById('btn-share-file');
  if (btnFileShare) {
    if (!isDirectory) {
      btnFileShare.style.display = 'inline-flex';
      btnFileShare.onclick = () => shareOriginalFile(subpath, name);
    } else {
      btnFileShare.style.display = 'none';
    }
  }

  const waText = encodeURIComponent(`📁 *Lihat berkas di ShareDrive LAN*:\n*${name}*\n${fullUrl}`);
  const btnWa = document.getElementById('btn-share-wa');
  if (btnWa) {
    btnWa.onclick = () => {
      window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
    };
  }

  const btnTg = document.getElementById('btn-share-tg');
  if (btnTg) {
    btnTg.onclick = () => {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(fullUrl)}&text=${encodeURIComponent('Lihat berkas: ' + name)}`, '_blank');
    };
  }

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

function previewFile(subpath, filename, ext, rawItem = null) {
  const container = document.getElementById('preview-container');
  if (!container) return;
  container.innerHTML = '';

  let item = rawItem;
  if (!item && currentItems) {
    item = currentItems.find(i => (i.subpath === subpath || i.name === filename)) || { name: filename, extension: ext, size: 0 };
  }

  currentPreviewItem = { subpath, filename, ext, item: item || {} };

  const titleEl = document.getElementById('preview-filename');
  if (titleEl) titleEl.innerText = filename;

  const btnDownloadModal = document.getElementById('btn-modal-download');
  if (btnDownloadModal) {
    btnDownloadModal.onclick = () => downloadFile(subpath);
  }

  const btnModalDetail = document.getElementById('btn-modal-detail');
  if (btnModalDetail) {
    btnModalDetail.onclick = () => {
      closeAllRowMenus();
      showFileDetail(currentPreviewItem);
    };
  }

  const btnModalRename = document.getElementById('btn-modal-rename');
  if (btnModalRename) {
    btnModalRename.onclick = () => {
      closeAllRowMenus();
      closeModal('modal-preview');
      promptRename(subpath, filename);
    };
  }

  const btnModalCut = document.getElementById('btn-modal-cut');
  if (btnModalCut) {
    btnModalCut.onclick = () => {
      closeAllRowMenus();
      setCutItems([subpath]);
      alert(`✂️ "${filename}" ditambahkan ke Cut clipboard.`);
    };
  }

  const btnModalCopy = document.getElementById('btn-modal-copy');
  if (btnModalCopy) {
    btnModalCopy.onclick = () => {
      closeAllRowMenus();
      setCopyItems([subpath]);
      alert(`📋 "${filename}" ditambahkan ke Copy clipboard.`);
    };
  }

  const btnModalPaste = document.getElementById('btn-modal-paste');
  if (btnModalPaste) {
    btnModalPaste.style.display = (clipboard && clipboard.items && clipboard.items.length > 0) ? 'flex' : 'none';
    btnModalPaste.onclick = () => {
      closeAllRowMenus();
      executePaste(currentSubpath);
    };
  }

  const btnShareModal = document.getElementById('btn-modal-share');
  if (btnShareModal) {
    btnShareModal.onclick = () => {
      closeAllRowMenus();
      shareLink(subpath, false, filename);
    };
  }

  const fileUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}&preview=1`;
  const lowerExt = (ext || '').toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(lowerExt)) {
    container.innerHTML = `<img src="${fileUrl}" alt="${escapeHtml(filename)}" style="max-width:100%; max-height:65vh; border-radius:4px;">`;
  } else if (['.mp4', '.webm', '.mkv', '.avi', '.mov', '.ogg', '.3gp'].includes(lowerExt)) {
    container.innerHTML = `<video src="${fileUrl}" controls autoplay style="max-width:100%; max-height:65vh; border-radius:4px;"></video>`;
  } else if (['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].includes(lowerExt)) {
    container.innerHTML = `<audio src="${fileUrl}" controls autoplay style="width:100%; margin:2rem 0;"></audio>`;
  } else if (lowerExt === '.pdf') {
    container.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:60vh; border:none; border-radius:4px;"></iframe>`;
  } else if (['.txt', '.json', '.md', '.js', '.html', '.css', '.py', '.sh', '.bat', '.cmd', '.xml', '.yaml', '.yml', '.csv', '.log', '.env', '.ini', '.sql', '.php', '.java', '.c', '.cpp', '.h', '.ts', '.jsx', '.tsx'].includes(lowerExt)) {
    container.innerHTML = `<p style="color:var(--win-text-muted)">Memuat isi teks...</p>`;
    fetch(fileUrl)
      .then(res => {
        if (!res.ok) throw new Error('Gagal memuat berkas');
        return res.text();
      })
      .then(text => {
        container.innerHTML = `<pre style="background:var(--win-bg); padding:1rem; border-radius:4px; width:100%; max-height:60vh; overflow:auto; font-family:monospace; font-size:0.85rem; white-space:pre-wrap; word-break:break-all;">${escapeHtml(text)}</pre>`;
      })
      .catch(err => {
        container.innerHTML = `<p style="color:var(--win-danger)">Terjadi kesalahan saat memuat isi teks berkas.</p>`;
      });
  } else {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <div style="font-size: 3.5rem; margin-bottom: 0.75rem;">📄</div>
        <h4 style="margin-bottom: 0.5rem; font-weight: 600;">${escapeHtml(filename)}</h4>
        <p style="color: var(--win-text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Pratinjau langsung tidak tersedia untuk format berkas ini.</p>
        <div style="display: flex; gap: 0.5rem; justify-content: center;">
          <button class="btn-icon" style="background: var(--win-card); border-color: var(--win-border); padding: 0.6rem 1.25rem; font-size: 0.95rem;" onclick="shareLink('${escapeJsStr(subpath)}', false, '${escapeJsStr(filename)}')">
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

function getFileIcon(item, itemSubpath = '') {
  if (item.isDirectory) return '📁';
  const ext = (item.extension || '').toLowerCase();
  const subpath = itemSubpath || item.subpath || (currentSubpath ? `${currentSubpath}/${item.name}` : item.name);

  if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext)) {
    if (currentFolderId && subpath) {
      const imgUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}&preview=1`;
      return `<img src="${imgUrl}" class="file-thumb-icon" alt="thumb" onerror="this.onerror=null; this.parentElement.innerHTML='🖼️';" />`;
    }
    return '🖼️';
  }

  if (['.mp4', '.webm', '.mkv', '.avi', '.mov', '.ogg', '.3gp'].includes(ext)) {
    if (currentFolderId && subpath) {
      const videoUrl = `/api/folders/${currentFolderId}/file?subpath=${encodeURIComponent(subpath)}`;
      return `<video src="${videoUrl}#t=0.1" preload="metadata" class="file-thumb-icon" style="object-fit: cover; pointer-events: none;" muted onerror="this.onerror=null; this.parentElement.innerHTML='🎬';"></video>`;
    }
    return '🎬';
  }

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
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      if (m.id !== id) m.classList.remove('active');
    });

    el.classList.add('active');

    const baseFolderHash = `#folder=${encodeURIComponent(currentFolderId || '')}&subpath=${encodeURIComponent(currentSubpath || '')}`;
    const modalHash = `${baseFolderHash}&modal=${encodeURIComponent(id)}`;

    if (window.location.hash !== modalHash) {
      history.pushState({ modalId: id, folderId: currentFolderId, subpath: currentSubpath }, '', modalHash);
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el && el.classList.contains('active')) {
    el.classList.remove('active');
  }

  // Stop & pause any active video/audio playback when modal is closed
  if (el) {
    el.querySelectorAll('video, audio').forEach(media => {
      try {
        media.pause();
        media.currentTime = 0;
        media.src = '';
        media.load();
      } catch (e) {}
    });
  }

  if (id === 'modal-preview') {
    const container = document.getElementById('modal-preview-body');
    if (container) {
      container.innerHTML = '';
    }
  }

  const baseFolderHash = `#folder=${encodeURIComponent(currentFolderId || '')}&subpath=${encodeURIComponent(currentSubpath || '')}`;
  history.replaceState({ folderId: currentFolderId, subpath: currentSubpath }, '', baseFolderHash);

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
  if (!hash) return false;

  const cleanHash = hash.replace(/^#/, '');
  const hashWithoutModal = cleanHash.replace(/&modal=[^&]*/, '').replace(/modal=[^&]*/, '');
  const params = new URLSearchParams(hashWithoutModal);
  const folderId = params.get('folder');
  const subpath = params.get('subpath') || '';

  if (folderId) {
    currentFolderId = folderId;
    currentSubpath = subpath;
    updateSidebarActiveItem(folderId);
    loadFolderContents(folderId, subpath, false);
    buildSidebarFolderTree(folderId);

    const folderHash = `#folder=${encodeURIComponent(folderId)}&subpath=${encodeURIComponent(subpath)}`;
    history.replaceState({ folderId, subpath }, '', folderHash);
    return true;
  }
  return false;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJsStr(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
