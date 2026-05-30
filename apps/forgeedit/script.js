// script.js
(function () {
  'use strict';

  const APP_NAME = 'ForgeEdit Pro';
  const DB_NAME = 'ForgeEditProDB';
  const DB_VERSION = 1;
  const LS_KEY_SETTINGS = 'forgeedit_settings';
  const LS_KEY_RECENT = 'forgeedit_recent';

  const state = {
    db: null,
    files: new Map(),
    tabs: [],
    activeTab: null,
    editor: null,
    settings: {
      theme: 'dark',
      fontSize: 14,
      lineHeight: 1.6,
      showLineNumbers: true,
      highlightActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      wordWrap: true,
      showWhitespace: false,
      scrollPastEnd: true,
      keyMap: 'default',
      tabSize: 2,
      insertSpaces: true,
      autoSave: true,
      autoSaveInterval: 10000,
      autoFold: false
    },
    zenMode: false,
    sidebarOpen: true,
    autoSaveTimer: null,
    findPanelOpen: false,
    commandPaletteOpen: false
  };

  // --- IndexedDB Manager ---
  const DB = {
    async open() {
      return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        };
        req.onsuccess = e => res(e.target.result);
        req.onerror = e => rej(e);
      });
    },
    async getFiles() {
      return new Promise((res, rej) => {
        const tx = state.db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = rej;
      });
    },
    async saveFile(file) {
      return new Promise((res, rej) => {
        const tx = state.db.transaction('files', 'readwrite');
        tx.objectStore('files').put(file);
        tx.oncomplete = () => res();
        tx.onerror = rej;
      });
    },
    async deleteFile(id) {
      return new Promise((res, rej) => {
        const tx = state.db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id);
        tx.oncomplete = () => res();
        tx.onerror = rej;
      });
    },
    async getSetting(key) {
      return new Promise((res, rej) => {
        const tx = state.db.transaction('settings', 'readonly');
        const req = tx.objectStore('settings').get(key);
        req.onsuccess = () => res(req.result?.value ?? null);
        req.onerror = rej;
      });
    },
    async setSetting(key, value) {
      return new Promise((res, rej) => {
        const tx = state.db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ key, value });
        tx.oncomplete = () => res();
        tx.onerror = rej;
      });
    }
  };

  // --- UI Helpers ---
  function showToast(msg, type = 'info') {
    const container = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
      </svg>
      <span>${msg}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function toggleModal(id, show) {
    const modal = document.querySelector(`#${id}`);
    if (!modal) return;
    modal.parentElement.classList.toggle('active', show);
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }

  // --- File & Tab Manager ---
  function createFileTab(file) {
    const existing = state.tabs.find(t => t.id === file.id);
    if (existing) return switchTab(file.id);

    state.tabs.push(file);
    renderTabs();
    switchTab(file.id);
  }

  function renderTabs() {
    const container = document.querySelector('.file-tabs');
    container.innerHTML = '';
    state.tabs.forEach(tab => {
      const el = document.createElement('button');
      el.className = `file-tab ${tab.id === state.activeTab ? 'active' : ''}`;
      el.innerHTML = `
        <span class="tab-icon">${getFileIcon(tab.name)}</span>
        <span class="tab-name">${tab.name}</span>
        ${tab.modified ? '<span class="tab-dot"></span>' : ''}
        <span class="close-tab" data-id="${tab.id}">&times;</span>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-tab')) {
          closeTab(tab.id);
        } else {
          switchTab(tab.id);
        }
      });
      container.appendChild(el);
    });
  }

  function switchTab(id) {
    state.activeTab = id;
    const file = state.tabs.find(t => t.id === id);
    if (!file || !state.editor) return;

    state.editor.setValue(file.content || '');
    state.editor.clearHistory();
    state.editor.markText(state.editor.indexFromPos({ line: 0, ch: 0 }), state.editor.indexFromPos({ line: 0, ch: 0 }));
    updateStatusBar(file);
    renderTabs();
  }

  function closeTab(id) {
    state.tabs = state.tabs.filter(t => t.id !== id);
    if (state.activeTab === id) {
      state.activeTab = state.tabs.length > 0 ? state.tabs[state.tabs.length - 1].id : null;
    }
    renderTabs();
    if (state.activeTab) switchTab(state.activeTab);
    else {
      state.editor.setValue('');
      document.querySelector('.status-bar-left').innerHTML = '<span class="status-item">Ready</span>';
      document.querySelector('.status-bar-right').innerHTML = '<span class="status-item">Plain Text</span><span class="status-item">Spaces: 2</span><span class="status-item">LF</span>';
    }
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { js: '📜', css: '🎨', html: '🌐', md: '📝', json: '⚙️', py: '🐍', txt: '📄' };
    return icons[ext] || '📄';
  }

  function updateStatusBar(file) {
    if (!file) return;
    const left = document.querySelector('.status-bar-left');
    const right = document.querySelector('.status-bar-right');
    const line = state.editor.getCursor().line + 1;
    const col = state.editor.getCursor().ch + 1;
    const modified = file.modified ? '<span class="status-dot modified"></span>' : '<span class="status-dot"></span>';
    left.innerHTML = `${modified}<span class="status-item">Ln ${line}, Col ${col}</span><span class="status-item">UTF-8</span>`;
    right.innerHTML = `<span class="status-item">${getFileIcon(file.name)} ${file.name.split('.').pop().toUpperCase() || 'TXT'}</span><span class="status-item">Spaces: ${state.settings.tabSize}</span><span class="status-item">LF</span>`;
  }

  // --- Editor Setup ---
  function initEditor() {
    const container = document.createElement('div');
    container.className = 'code-editor-wrapper';
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);
    document.querySelector('.editor-container').prepend(container);

    if (typeof CodeMirror === 'undefined') {
      container.innerHTML = '<div class="welcome-screen"><p>Editor library belum dimuat. Tambahkan CDN CodeMirror.</p></div>';
      return;
    }

    state.editor = CodeMirror.fromTextArea(textarea, {
      theme: 'material-darker',
      lineNumbers: state.settings.showLineNumbers,
      highlightActiveLine: state.settings.highlightActiveLine,
      matchBrackets: state.settings.matchBrackets,
      autoCloseBrackets: state.settings.autoCloseBrackets,
      lineWrapping: state.settings.wordWrap,
      showTrailingSpace: state.settings.showWhitespace,
      scrollPastEnd: state.settings.scrollPastEnd,
      indentUnit: state.settings.tabSize,
      tabSize: state.settings.tabSize,
      indentWithTabs: !state.settings.insertSpaces,
      keyMap: state.settings.keyMap,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
    });

    state.editor.on('change', () => {
      if (!state.activeTab) return;
      const file = state.tabs.find(t => t.id === state.activeTab);
      if (file) {
        file.content = state.editor.getValue();
        file.modified = true;
        renderTabs();
        updateStatusBar(file);
      }
    });

    state.editor.on('cursorActivity', () => {
      if (state.activeTab) updateStatusBar(state.tabs.find(t => t.id === state.activeTab));
    });

    applySettingsToEditor();
    startAutoSave();
  }

  function applySettingsToEditor() {
    if (!state.editor) return;
    state.editor.setOption('lineNumbers', state.settings.showLineNumbers);
    state.editor.setOption('highlightActiveLine', state.settings.highlightActiveLine);
    state.editor.setOption('matchBrackets', state.settings.matchBrackets);
    state.editor.setOption('autoCloseBrackets', state.settings.autoCloseBrackets);
    state.editor.setOption('lineWrapping', state.settings.wordWrap);
    state.editor.setOption('showTrailingSpace', state.settings.showWhitespace);
    state.editor.setOption('scrollPastEnd', state.settings.scrollPastEnd);
    state.editor.setOption('indentUnit', state.settings.tabSize);
    state.editor.setOption('tabSize', state.settings.tabSize);
    state.editor.setOption('indentWithTabs', !state.settings.insertSpaces);
    state.editor.setOption('keyMap', state.settings.keyMap);
    const cmDom = state.editor.getWrapperElement();
    cmDom.style.fontSize = `${state.settings.fontSize}px`;
    cmDom.style.lineHeight = state.settings.lineHeight;
  }

  // --- Auto Save ---
  function startAutoSave() {
    if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
    if (!state.settings.autoSave) return;
    state.autoSaveTimer = setInterval(async () => {
      if (state.activeTab && state.tabs.find(t => t.id === state.activeTab)?.modified) {
        await saveCurrentFile();
      }
    }, state.settings.autoSaveInterval);
  }

  async function saveCurrentFile() {
    if (!state.activeTab) return;
    const file = state.tabs.find(t => t.id === state.activeTab);
    if (!file) return;
    file.content = state.editor.getValue();
    file.modified = false;
    await DB.saveFile(file);
    renderTabs();
    updateStatusBar(file);
    showToast(`Saved: ${file.name}`, 'success');
  }

  // --- PWA & SW ---
  async function initPWA() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        if (reg.installing || reg.waiting) {
          showToast('App updated! Refresh to apply.', 'info');
        }
      } catch (err) {
        console.warn('SW registration failed:', err);
      }
    }
    if ('BeforeInstallPromptEvent' in window) {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        // Simpan event jika ingin menampilkan prompt kustom
      });
    }
  }

  // --- Event Listeners ---
  function bindEvents() {
    // Toolbar
    document.getElementById('new-file-btn')?.addEventListener('click', () => toggleModal('new-file-modal', true));
    document.getElementById('open-file-btn')?.addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('save-btn')?.addEventListener('click', saveCurrentFile);
    document.getElementById('find-btn')?.addEventListener('click', toggleFindPanel);
    document.getElementById('preview-btn')?.addEventListener('click', togglePreview);
    document.getElementById('split-btn')?.addEventListener('click', toggleSplitView);
    document.getElementById('zen-btn')?.addEventListener('click', toggleZenMode);
    document.getElementById('settings-btn')?.addEventListener('click', () => toggleModal('settings-modal', true));
    document.getElementById('shortcuts-btn')?.addEventListener('click', () => toggleModal('shortcuts-modal', true));
    document.getElementById('snippets-btn')?.addEventListener('click', () => toggleModal('snippets-modal', true));
    document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);

    // Modals
    document.querySelectorAll('.modal-overlay .btn-cancel, .modal-overlay .close-modal').forEach(btn => {
      btn.addEventListener('click', () => closeAllModals());
    });

    document.getElementById('create-file-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-file-name').value.trim();
      if (!name) return;
      const id = 'f_' + Date.now();
      const file = { id, name, content: '', modified: false, created: new Date().toISOString() };
      state.files.set(id, file);
      await DB.saveFile(file);
      createFileTab(file);
      closeAllModals();
      document.getElementById('new-file-name').value = '';
      showToast(`Created: ${name}`, 'success');
    });

    // File Input
    document.getElementById('file-input')?.addEventListener('change', handleFileUpload);

    // Drag & Drop
    window.addEventListener('dragover', e => { e.preventDefault(); document.querySelector('.drag-overlay').classList.add('active'); });
    window.addEventListener('dragleave', e => { if (e.relatedTarget === null) document.querySelector('.drag-overlay').classList.remove('active'); });
    window.addEventListener('drop', e => {
      e.preventDefault();
      document.querySelector('.drag-overlay').classList.remove('active');
      handleFileUpload({ target: { files: e.dataTransfer.files } });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', handleShortcuts);

    // Settings
    document.querySelectorAll('.settings-control input, .settings-control select').forEach(el => {
      el.addEventListener('change', applySettings);
    });

    // Command Palette
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    });

    document.getElementById('command-palette-input')?.addEventListener('input', filterCommands);
    document.querySelector('.command-palette')?.addEventListener('keydown', e => {
      if (e.key === 'Escape') toggleCommandPalette(false);
    });
  }

  function toggleFindPanel() {
    state.findPanelOpen = !state.findPanelOpen;
    document.querySelector('.find-panel').classList.toggle('active', state.findPanelOpen);
    if (state.findPanelOpen && state.editor) state.editor.execCommand('find');
  }

  function togglePreview() {
    const container = document.querySelector('.editor-container');
    container.classList.toggle('preview-mode');
    const isPreview = container.classList.contains('preview-mode');
    document.getElementById('preview-btn').classList.toggle('active', isPreview);
    if (isPreview && typeof marked !== 'undefined') {
      document.querySelector('.markdown-preview').innerHTML = marked.parse(state.editor.getValue());
    }
  }

  function toggleSplitView() {
    document.querySelector('.editor-container').classList.toggle('split-view');
    document.getElementById('split-btn').classList.toggle('active');
  }

  function toggleZenMode() {
    state.zenMode = !state.zenMode;
    document.querySelector('.editor-container').classList.toggle('zen-mode', state.zenMode);
    document.getElementById('zen-btn').classList.toggle('active', state.zenMode);
  }

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    document.querySelector('.sidebar').classList.toggle('collapsed', !state.sidebarOpen);
    document.getElementById('sidebar-toggle').classList.toggle('active', state.sidebarOpen);
    if (window.innerWidth <= 768) {
      document.querySelector('.sidebar-overlay').classList.toggle('active', state.sidebarOpen);
    }
  }

  function toggleCommandPalette(show = !state.commandPaletteOpen) {
    state.commandPaletteOpen = show;
    document.querySelector('.command-palette').classList.toggle('active', show);
    if (show) {
      document.getElementById('command-palette-input').focus();
      document.getElementById('command-palette-input').value = '';
      filterCommands();
    }
  }

  function filterCommands() {
    const query = document.getElementById('command-palette-input').value.toLowerCase();
    document.querySelectorAll('.command-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  }

  function handleShortcuts(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = false;

    if (ctrl && key === 's') { e.preventDefault(); saveCurrentFile(); handled = true; }
    if (ctrl && key === 'f') { e.preventDefault(); toggleFindPanel(); handled = true; }
    if (ctrl && key === 'h') { e.preventDefault(); if(state.editor) state.editor.execCommand('replace'); handled = true; }
    if (ctrl && key === 'p') { e.preventDefault(); togglePreview(); handled = true; }
    if (ctrl && e.shiftKey && key === 'z') { e.preventDefault(); toggleZenMode(); handled = true; }
    if (ctrl && key === 'b') { e.preventDefault(); toggleSidebar(); handled = true; }
    if (ctrl && key === ',') { e.preventDefault(); toggleModal('settings-modal', true); handled = true; }
    if (key === 'escape') { closeAllModals(); toggleCommandPalette(false); state.findPanelOpen && toggleFindPanel(); handled = true; }

    if (handled) return;
  }

  function applySettings() {
    state.settings.theme = document.getElementById('app-theme')?.value || 'dark';
    state.settings.fontSize = parseInt(document.getElementById('font-size')?.value || 14);
    state.settings.lineHeight = parseFloat(document.getElementById('line-height')?.value || 1.6);
    state.settings.showLineNumbers = document.getElementById('line-numbers')?.checked ?? true;
    state.settings.highlightActiveLine = document.getElementById('active-line')?.checked ?? true;
    state.settings.matchBrackets = document.getElementById('match-brackets')?.checked ?? true;
    state.settings.autoCloseBrackets = document.getElementById('auto-brackets')?.checked ?? true;
    state.settings.wordWrap = document.getElementById('word-wrap')?.checked ?? true;
    state.settings.showWhitespace = document.getElementById('show-whitespace')?.checked ?? false;
    state.settings.scrollPastEnd = document.getElementById('scroll-past')?.checked ?? true;
    state.settings.keyMap = document.getElementById('keymap')?.value || 'default';
    state.settings.tabSize = parseInt(document.getElementById('tab-size')?.value || 2);
    state.settings.insertSpaces = document.getElementById('insert-spaces')?.checked ?? true;
    state.settings.autoSave = document.getElementById('auto-save')?.checked ?? true;
    state.settings.autoSaveInterval = parseInt(document.getElementById('autosave-interval')?.value || 10000) * 1000;

    localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(state.settings));
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    applySettingsToEditor();
    startAutoSave();
    showToast('Settings saved', 'success');
  }

  async function loadSettings() {
    const saved = localStorage.getItem(LS_KEY_SETTINGS);
    if (saved) {
      Object.assign(state.settings, JSON.parse(saved));
    }
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    applySettingsToEditor();
  }

  async function handleFileUpload(e) {
    const files = e.target.files || e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      const content = await file.text();
      const id = 'f_' + Date.now() + Math.random().toString(36).substr(2, 5);
      const fileObj = { id, name: file.name, content, modified: true, created: new Date().toISOString() };
      state.files.set(id, fileObj);
      await DB.saveFile(fileObj);
      createFileTab(fileObj);
    }
    showToast(`Imported ${files.length} file(s)`, 'success');
  }

  async function exportFile() {
    if (!state.activeTab) return showToast('No file open', 'warning');
    const file = state.tabs.find(t => t.id === state.activeTab);
    const format = document.getElementById('export-format')?.value || 'txt';
    let blob, ext, mime;

    switch (format) {
      case 'html': ext = 'html'; mime = 'text/html'; break;
      case 'md': ext = 'md'; mime = 'text/markdown'; break;
      default: ext = 'txt'; mime = 'text/plain';
    }
    blob = new Blob([file.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.split('.')[0]}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported as .${ext}`, 'success');
  }

  document.getElementById('export-btn')?.addEventListener('click', () => {
    toggleModal('export-modal', true);
    document.getElementById('export-format-btn')?.addEventListener('click', exportFile);
  });

  // --- Init ---
  async function init() {
    try {
      state.db = await DB.open();
      await loadSettings();
      bindEvents();
      initEditor();
      initPWA();

      const storedFiles = await DB.getFiles();
      storedFiles.forEach(f => state.files.set(f.id, f));
      if (storedFiles.length > 0) {
        createFileTab(storedFiles[0]);
      }

      showToast(`${APP_NAME} loaded successfully`, 'success');
    } catch (err) {
      console.error('Init failed:', err);
      showToast('Failed to initialize app', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
