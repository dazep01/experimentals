/* ============================================================
   ForgeEdit Pro — script.js
   Editor Multifungsi PWA dengan IndexedDB, CodeMirror, Markdown
   ============================================================ */

(function () {
  'use strict';

  /* ───────────── IndexedDB Layer ───────────── */
  const DB_NAME = 'ForgeEditDB';
  const DB_VER = 1;
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('files')) {
          const s = d.createObjectStore('files', { keyPath: 'path' });
          s.createIndex('parent', 'parent', { unique: false });
          s.createIndex('type', 'type', { unique: false });
          s.createIndex('modified', 'modified', { unique: false });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!d.objectStoreNames.contains('snippets')) {
          d.createObjectStore('snippets', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function dbTx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function dbPut(store, data) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readwrite').put(data);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function dbGet(store, key) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readonly').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function dbDelete(store, key) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readwrite').delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  function dbGetAll(store) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readonly').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function dbGetAllByIndex(store, idx, val) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readonly').index(idx).getAll(val);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /* ───────────── Utility Functions ───────────── */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function showToast(msg, type = 'info', dur = 3500) {
    const c = $('#toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
    };
    t.innerHTML = `${icons[type] || icons.info}<span>${msg}</span><span class="toast-close" onclick="this.parentElement.remove()">&times;</span>`;
    c.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'slideOutToast 0.3s ease forwards';
      setTimeout(() => t.remove(), 300);
    }, dur);
  }

  function getExt(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function getParentPath(path) {
    const i = path.lastIndexOf('/');
    return i > 0 ? path.slice(0, i) : '/';
  }

  function getFileName(path) {
    const i = path.lastIndexOf('/');
    return i >= 0 ? path.slice(i + 1) : path;
  }

  function fileIcon(name, isFolder, isOpen) {
    if (isFolder) return isOpen ? '&#128194;' : '&#128193;';
    const ext = getExt(name);
    const map = {
      js: '&#128293;', ts: '&#128305;', tsx: '&#128307;', jsx: '&#128307;',
      html: '&#127760;', htm: '&#127760;', css: '&#127912;', scss: '&#127912;', less: '&#127912;', sass: '&#127912;',
      json: '&#128218;', xml: '&#128196;', yaml: '&#128196;', yml: '&#128196;', toml: '&#128196;',
      py: '&#128013;', rb: '&#128147;', go: '&#128051;', rs: '&#129409;', java: '&#9749;', c: '&#129413;', cpp: '&#129413;', h: '&#129413;',
      php: '&#128024;', sql: '&#128451;', sh: '&#128025;', bash: '&#128025;', ps1: '&#128426;',
      md: '&#128221;', txt: '&#128196;', env: '&#128274;', conf: '&#9881;', ini: '&#9881;',
      dockerfile: '&#128051;', vue: '&#128640;', coffee: '&#9749;', lua: '&#127914;',
      svg: '&#127912;', png: '&#128444;', jpg: '&#128444;', jpeg: '&#128444;', gif: '&#128444;', webp: '&#128444;', ico: '&#128444;',
    };
    return map[ext] || '&#128196;';
  }

  function getModeForFile(name) {
    const ext = getExt(name);
    const map = {
      js: 'javascript', jsx: 'jsx', ts: 'javascript', tsx: 'jsx',
      html: 'htmlmixed', htm: 'htmlmixed', css: 'css', scss: 'sass', less: 'less', sass: 'sass',
      json: { name: 'javascript', json: true }, xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'text/x-java', c: 'text/x-csrc', cpp: 'text/x-c++src', h: 'text/x-csrc',
      php: 'php', sql: 'sql', sh: 'shell', bash: 'shell', ps1: 'powershell',
      md: 'markdown', markdown: 'markdown', txt: 'text/plain',
      env: 'properties', conf: 'properties', ini: 'properties',
      dockerfile: 'dockerfile', vue: 'htmlmixed', coffee: 'coffeescript', ls: 'livescript', lua: 'lua',
      pl: 'perl', pm: 'perl', vb: 'vb', vbs: 'vbscript',
      pug: 'pug', jade: 'pug', styl: 'stylus',
      diff: 'diff', patch: 'diff',
      twig: 'twig', hbs: 'handlebars', handlebars: 'handlebars',
      gfm: 'gfm'
    };
    return map[ext] || 'text/plain';
  }

  function getFileTypeName(name) {
    const ext = getExt(name);
    const map = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
      html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS', sass: 'Sass',
      json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
      py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', c: 'C', cpp: 'C++', h: 'C Header',
      php: 'PHP', sql: 'SQL', sh: 'Shell', ps1: 'PowerShell',
      md: 'Markdown', txt: 'Plain Text',
      dockerfile: 'Dockerfile', vue: 'Vue', coffee: 'CoffeeScript', lua: 'Lua',
      pl: 'Perl', vb: 'Visual Basic', diff: 'Diff',
      svg: 'SVG', png: 'PNG Image', jpg: 'JPEG Image', gif: 'GIF Image', webp: 'WebP Image'
    };
    return map[ext] || 'Plain Text';
  }

  function isMarkdownFile(name) {
    const ext = getExt(name);
    return ext === 'md' || ext === 'markdown';
  }

  function isImageFile(name) {
    const ext = getExt(name);
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString();
  }

  /* ───────────── App State ───────────── */
  const state = {
    openTabs: [],       // [{path, name, modified}]
    activeTab: null,    // path
    editors: {},        // path -> CodeMirror instance
    mdEditors: {},      // path -> CodeMirror instance (markdown split)
    fileContents: {},   // path -> string
    sidebarOpen: false,
    settings: {
      theme: 'dark', editorTheme: 'material-darker', fontSize: 14, lineHeight: 1.6,
      lineNumbers: true, activeLine: true, matchBrackets: true, autoCloseBrackets: true,
      wordWrap: true, showWhitespace: false, scrollPastEnd: true,
      keyMap: 'default', tabSize: 2, insertSpaces: true, autoSave: true, autoFold: false,
    },
    recentFiles: [],
    markdownView: 'split', // 'split' | 'preview' | 'editor'
    snippets: [
      { id: uid(), name: 'HTML5 Boilerplate', lang: 'html', code: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>' },
      { id: uid(), name: 'React Component', lang: 'jsx', code: "import React from 'react';\n\nexport default function Component() {\n  return (\n    <div>\n      \n    </div>\n  );\n}" },
      { id: uid(), name: 'Express Server', lang: 'js', code: "const express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello World' });\n});\n\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});" },
      { id: uid(), name: 'Python Flask', lang: 'py', code: "from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.route('/')\ndef index():\n    return jsonify({'message': 'Hello World'})\n\nif __name__ == '__main__':\n    app.run(debug=True)" },
      { id: uid(), name: 'Docker Compose', lang: 'yaml', code: "version: '3.8'\nservices:\n  web:\n    build: .\n    ports:\n      - '3000:3000'\n    volumes:\n      - .:/app\n    environment:\n      - NODE_ENV=development\n  db:\n    image: postgres:15\n    environment:\n      POSTGRES_DB: mydb\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:" },
    ],
    autoSaveTimer: null,
  };

  /* ───────────── DOM References ───────────── */
  const DOM = {};
  function cacheDom() {
    const ids = [
      'sidebar', 'sidebarOverlay', 'fileTree', 'sidebarSearch',
      'toggleSidebar', 'openSettings', 'openCommandPalette',
      'newFile', 'newFolder', 'collapseAll', 'openPreview',
      'fileTabs', 'breadcrumb', 'btnPreview',
      'toolbar', 'formatToolbar', 'viewToolbar', 'codeToolbar',
      'editorContainer', 'welcomeScreen', 'codeEditorWrapper',
      'markdownWrapper', 'markdownEditorPane', 'markdownPreviewPane',
      'markdownPreview', 'markdownToolbar', 'splitResize',
      'imagePreview', 'imagePreviewImg', 'imagePreviewInfo',
      'findPanel', 'findInput', 'replaceInput', 'findCaseSensitive', 'findWholeWord', 'findRegex',
      'findStatus', 'findPrevBtn', 'findNextBtn', 'replaceBtn', 'replaceAllBtn', 'closeFindPanel',
      'commandPalette', 'commandInput', 'commandResults',
      'contextMenu', 'dragOverlay',
      'statusText', 'statusDot', 'statusLine', 'statusSelection', 'statusFileType', 'statusSpaces', 'statusEOL', 'statusLang', 'statusEncoding', 'statusReady',
      'newFileModal', 'newFileName', 'newFileLocation', 'newFileType', 'createNewFile', 'cancelNewFile', 'closeNewFileModal',
      'newFolderModal', 'newFolderName', 'newFolderLocation', 'createNewFolder', 'cancelNewFolder', 'closeNewFolderModal',
      'renameModal', 'renameInput', 'confirmRename', 'cancelRename', 'closeRenameModal',
      'exportModal', 'exportFormat', 'confirmExport', 'cancelExport', 'closeExportModal',
      'settingsModal', 'closeSettingsModal', 'saveSettings', 'resetSettings',
      'settingTheme', 'settingEditorTheme', 'settingFontSize', 'settingLineHeight',
      'fontSizeValue', 'lineHeightValue',
      'settingLineNumbers', 'settingActiveLine', 'settingMatchBrackets', 'settingAutoCloseBrackets',
      'settingWordWrap', 'settingShowWhitespace', 'settingScrollPastEnd',
      'settingKeyMap', 'settingTabSize', 'settingInsertSpaces', 'settingAutoSave', 'settingAutoFold',
      'storageUsed', 'storageUsedDesc', 'exportAllData', 'importDataBtn', 'clearAllData',
      'shortcutsModal', 'closeShortcutsModal', 'closeShortcutsBtn',
      'snippetsModal', 'snippetsList', 'closeSnippetsModal', 'closeSnippetsBtn',
      'toastContainer',
      'fileInput', 'folderInput', 'importInput',
      'btnUndo', 'btnRedo', 'btnCut', 'btnCopy', 'btnPaste',
      'btnSave', 'btnFind', 'btnExport',
      'btnBold', 'btnItalic', 'btnHeading', 'btnLink', 'btnImage', 'btnCode', 'btnQuote', 'btnList', 'btnTable',
      'btnPreview1', 'btnSplit', 'btnFormat', 'btnMinify',
      'welcomeNewFile', 'welcomeOpenFile', 'welcomeOpenFolder',
      'recentFiles', 'recentFilesList', 'clearAllRecent',
      'logoBtn',
    ];
    ids.forEach(id => { DOM[id] = $(`#${id}`); });
  }

  /* ───────────── Settings Persistence ───────────── */
  async function loadSettings() {
    const s = await dbGet('settings', 'main');
    if (s && s.value) Object.assign(state.settings, s.value);
    const r = await dbGet('settings', 'recent');
    if (r && r.value) state.recentFiles = r.value;
    const sn = await dbGet('settings', 'snippets');
    if (sn && sn.value) state.snippets = sn.value;
  }

  async function saveSettingsToDB() {
    await dbPut('settings', { key: 'main', value: state.settings });
  }

  async function saveRecentFiles() {
    await dbPut('settings', { key: 'recent', value: state.recentFiles });
  }

  async function saveSnippetsToDB() {
    await dbPut('settings', { key: 'snippets', value: state.snippets });
  }

  /* ───────────── Theme ───────────── */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
  }

  function applyEditorTheme() {
    Object.values(state.editors).forEach(ed => {
      if (ed) ed.setOption('theme', state.settings.editorTheme);
    });
    Object.values(state.mdEditors).forEach(ed => {
      if (ed) ed.setOption('theme', state.settings.editorTheme);
    });
  }

  /* ───────────── Sidebar & File Tree ───────────── */
  function toggleSidebar(force) {
    state.sidebarOpen = force !== undefined ? force : !state.sidebarOpen;
    DOM.sidebar.classList.toggle('collapsed', !state.sidebarOpen);
    if (window.innerWidth < 768) {
      DOM.sidebarOverlay.classList.toggle('active', state.sidebarOpen);
      DOM.sidebarOverlay.style.display = state.sidebarOpen ? 'block' : 'none';
    }
  }

  async function loadFileTree() {
    const allFiles = await dbGetAll('files');
    const tree = buildTree(allFiles);
    DOM.fileTree.innerHTML = renderTree(tree);
    attachTreeEvents();
  }

  function buildTree(files) {
    const root = { name: '/', path: '/', type: 'folder', children: {}, open: true };
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.path.localeCompare(b.path);
    }).forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      let node = root;
      parts.forEach((part, i) => {
        if (!node.children[part]) {
          const isLast = i === parts.length - 1;
          node.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: isLast ? f.type : 'folder',
            children: {},
            open: false,
            data: isLast ? f : null,
          };
        }
        node = node.children[part];
      });
    });
    return root;
  }

  function renderTree(node, depth = 0) {
    let html = '';
    const entries = Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    entries.forEach(entry => {
      const isFolder = entry.type === 'folder';
      const hasChildren = Object.keys(entry.children).length > 0;
      const isActive = state.activeTab === entry.path;
      const isOpen = entry.open;
      const safePath = feEscapeHtml(entry.path);
      const safeName = feEscapeHtml(entry.name);
      html += `<li class="file-tree-item ${isActive ? 'active' : ''}" data-path="${safePath}" data-type="${entry.type}" style="padding-left:${8 + depth * 18}px">
        <span class="tree-toggle ${isFolder && isOpen ? 'expanded' : ''}" style="visibility:${isFolder || hasChildren ? 'visible' : 'hidden'}">${isFolder || hasChildren ? '&#9654;' : ''}</span>
        <span class="tree-icon ${isFolder ? (isOpen ? 'folder-open' : 'folder') : ''}">${fileIcon(entry.name, isFolder, isOpen)}</span>
        <span class="file-name">${safeName}</span>
        <div class="file-actions">
          <button class="icon-btn" data-action="rename" title="Rename" style="width:20px;height:20px;font-size:11px">&#9998;</button>
          <button class="icon-btn" data-action="delete" title="Delete" style="width:20px;height:20px;font-size:11px">&#128465;</button>
        </div>
      </li>`;
      if (isFolder && isOpen && hasChildren) {
        html += `<ul class="file-tree-children">${renderTree(entry, depth + 1)}</ul>`;
      }
    });
    return html;
  }

  function attachTreeEvents() {
    DOM.fileTree.querySelectorAll('.file-tree-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          e.stopPropagation();
          handleTreeAction(action.dataset.action, item.dataset.path, item.dataset.type);
          return;
        }
        const path = item.dataset.path;
        const type = item.dataset.type;
        if (type === 'folder') {
          toggleFolder(path);
        } else {
          openFile(path);
        }
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, item.dataset.path, item.dataset.type);
      });
    });
  }

  async function toggleFolder(path) {
    const data = await dbGet('files', path);
    if (data) {
      data.open = !data.open;
      await dbPut('files', data);
    }
    await loadFileTree();
  }

  async function handleTreeAction(action, path, type) {
    if (action === 'rename') {
      openRenameModal(path);
    } else if (action === 'delete') {
      if (confirm(`Delete "${getFileName(path)}"?`)) {
        await deleteNode(path, type);
        closeTab(path);
        await loadFileTree();
        showToast('Deleted successfully', 'success');
      }
    }
  }

  async function deleteNode(path, type) {
    if (type === 'folder') {
      const children = await dbGetAllByIndex('files', 'parent', path);
      for (const child of children) {
        await deleteNode(child.path, child.type);
      }
    }
    await dbDelete('files', path);
    delete state.fileContents[path];
    if (state.editors[path]) { state.editors[path].toTextArea(); delete state.editors[path]; }
    if (state.mdEditors[path]) { state.mdEditors[path].toTextArea(); delete state.mdEditors[path]; }
  }

  /* ───────────── File Operations ───────────── */
  async function openFile(path) {
    const data = await dbGet('files', path);
    if (!data) { showToast('File not found', 'error'); return; }

    if (!state.openTabs.find(t => t.path === path)) {
      state.openTabs.push({ path, name: data.name, modified: false });
    }
    state.activeTab = path;
    state.fileContents[path] = data.content || '';

    // Add to recent
    addRecent(path, data.name);

    renderTabs();
    await showEditor(path, data);
    updateStatusBar();
    if (state.sidebarOpen && window.innerWidth < 768) toggleSidebar(false);
    await loadFileTree();
  }

  function addRecent(path, name) {
    state.recentFiles = state.recentFiles.filter(r => r.path !== path);
    state.recentFiles.unshift({ path, name, time: Date.now() });
    if (state.recentFiles.length > 15) state.recentFiles.pop();
    saveRecentFiles();
  }

  async function showEditor(path, data) {
    DOM.welcomeScreen.style.display = 'none';
    DOM.codeEditorWrapper.style.display = 'none';
    DOM.markdownWrapper.style.display = 'none';
    DOM.imagePreview.style.display = 'none';

    // Hide all CodeMirror instances
    Object.entries(state.editors).forEach(([p, ed]) => {
      if (ed && ed.getWrapperElement) ed.getWrapperElement().style.display = 'none';
    });
    Object.entries(state.mdEditors).forEach(([p, ed]) => {
      if (ed && ed.getWrapperElement) ed.getWrapperElement().style.display = 'none';
    });

    const name = data.name || getFileName(path);
    const content = state.fileContents[path] !== undefined ? state.fileContents[path] : (data.content || '');

    if (isImageFile(name)) {
      DOM.imagePreview.style.display = 'flex';
      if (content && content.startsWith('data:')) {
        DOM.imagePreviewImg.src = content;
      } else {
        DOM.imagePreviewImg.src = '';
      }
      DOM.imagePreviewInfo.textContent = `${name}`;
      updateToolbarForFile(name);
      return;
    }

    if (isMarkdownFile(name)) {
      DOM.markdownWrapper.style.display = 'flex';
      await ensureMarkdownEditor(path, content, name);
      renderMarkdownPreview(path);
      updateToolbarForFile(name);
      return;
    }

    // Regular code editor
    DOM.codeEditorWrapper.style.display = 'flex';
    await ensureCodeEditor(path, content, name);
    updateToolbarForFile(name);
  }

  async function ensureCodeEditor(path, content, name) {
    if (state.editors[path]) {
      const ed = state.editors[path];
      ed.getWrapperElement().style.display = '';
      ed.refresh();
      ed.focus();
      return;
    }
    const wrapper = DOM.codeEditorWrapper;
    const div = document.createElement('div');
    div.id = 'cm-' + path.replace(/[^a-zA-Z0-9]/g, '_');
    wrapper.appendChild(div);

    const mode = getModeForFile(name);
    const ed = CodeMirror(div, {
      value: content,
      mode: mode,
      theme: state.settings.editorTheme,
      lineNumbers: state.settings.lineNumbers,
      lineWrapping: state.settings.wordWrap,
      matchBrackets: state.settings.matchBrackets,
      autoCloseBrackets: state.settings.autoCloseBrackets,
      styleActiveLine: state.settings.activeLine,
      showTrailingSpace: state.settings.showWhitespace,
      scrollPastEnd: state.settings.scrollPastEnd,
      tabSize: state.settings.tabSize,
      indentWithTabs: !state.settings.insertSpaces,
      keyMap: state.settings.keyMap,
      indentUnit: state.settings.tabSize,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      scrollbarStyle: 'overlay',
      extraKeys: {
        'Ctrl-S': () => saveCurrentFile(),
        'Cmd-S': () => saveCurrentFile(),
        'Ctrl-F': () => toggleFindPanel(true),
        'Ctrl-H': () => toggleFindPanel(true),
        'Ctrl-/': 'toggleComment',
        'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor()),
        'Ctrl-Space': 'autocomplete',
        'F2': 'jumpToLine',
      }
    });

    ed.on('change', () => {
      state.fileContents[path] = ed.getValue();
      markTabModified(path, true);
      updateStatusBar();
    });

    ed.on('cursorActivity', () => updateStatusBar());

    state.editors[path] = ed;
    setTimeout(() => { ed.refresh(); ed.focus(); }, 50);
  }

  async function ensureMarkdownEditor(path, content, name) {
    if (state.mdEditors[path]) {
      const ed = state.mdEditors[path];
      ed.getWrapperElement().style.display = '';
      ed.refresh();
      ed.focus();
      return;
    }
    const pane = DOM.markdownEditorPane;
    // Remove old CM in pane if any
    const oldCm = pane.querySelector('.CodeMirror');
    if (oldCm) oldCm.remove();

    const ed = CodeMirror(pane, {
      value: content,
      mode: 'markdown',
      theme: state.settings.editorTheme,
      lineNumbers: state.settings.lineNumbers,
      lineWrapping: true,
      matchBrackets: false,
      styleActiveLine: state.settings.activeLine,
      tabSize: state.settings.tabSize,
      indentWithTabs: !state.settings.insertSpaces,
      keyMap: state.settings.keyMap,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      scrollbarStyle: 'overlay',
      extraKeys: {
        'Ctrl-S': () => saveCurrentFile(),
        'Cmd-S': () => saveCurrentFile(),
        'Enter': 'newlineAndIndentContinueMarkdownList',
      }
    });

    ed.on('change', () => {
      state.fileContents[path] = ed.getValue();
      markTabModified(path, true);
      renderMarkdownPreview(path);
      updateStatusBar();
    });

    ed.on('cursorActivity', () => updateStatusBar());
    state.mdEditors[path] = ed;
    setTimeout(() => { ed.refresh(); ed.focus(); }, 50);
  }

  function renderMarkdownPreview(path) {
    if (!DOM.markdownPreview) return;
    const content = state.fileContents[path] || '';
    if (typeof markdownit === 'function' || typeof window.markdownit === 'function') {
      const md = (window.markdownit || markdownit)({
        html: true, linkify: true, typographer: true,
        highlight: function (str, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(str, { language: lang }).value; } catch (e) {}
          }
          return '';
        }
      });
      const raw = md.render(content);
      DOM.markdownPreview.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw) : raw;
    } else {
      DOM.markdownPreview.innerHTML = `<pre>${content}</pre>`;
    }
  }

  /* ───────────── Tabs ───────────── */
  function renderTabs() {
    if (!DOM.fileTabs) return;
    DOM.fileTabs.innerHTML = state.openTabs.map(tab => {
      const isActive = tab.path === state.activeTab;
      const safePath = feEscapeHtml(tab.path);
      const safeName = feEscapeHtml(tab.name);
      return `<div class="file-tab ${isActive ? 'active' : ''}" data-path="${safePath}">
        <span class="tab-icon">${fileIcon(tab.name, false)}</span>
        <span class="tab-name">${safeName}</span>
        ${tab.modified ? '<span class="tab-dot"></span>' : ''}
        <span class="close-tab" data-close="${safePath}">&times;</span>
      </div>`;
    }).join('');

    DOM.fileTabs.querySelectorAll('.file-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-tab')) {
          closeTab(e.target.dataset.close);
          return;
        }
        switchTab(tab.dataset.path);
      });
    });
  }

  async function switchTab(path) {
    if (state.activeTab === path) return;
    state.activeTab = path;
    const data = await dbGet('files', path);
    if (data) {
      await showEditor(path, data);
    }
    renderTabs();
    updateStatusBar();
    await loadFileTree();
  }

  function closeTab(path) {
    const idx = state.openTabs.findIndex(t => t.path === path);
    if (idx === -1) return;
    state.openTabs.splice(idx, 1);

    // Cleanup editors
    if (state.editors[path]) {
      const el = state.editors[path].getWrapperElement();
      if (el && el.parentNode) el.parentNode.removeChild(el);
      delete state.editors[path];
    }
    if (state.mdEditors[path]) {
      const el = state.mdEditors[path].getWrapperElement();
      if (el && el.parentNode) el.parentNode.removeChild(el);
      delete state.mdEditors[path];
    }

    if (state.activeTab === path) {
      if (state.openTabs.length > 0) {
        const nextIdx = Math.min(idx, state.openTabs.length - 1);
        switchTab(state.openTabs[nextIdx].path);
      } else {
        state.activeTab = null;
        showWelcome();
      }
    }
    renderTabs();
  }

  function markTabModified(path, modified) {
    const tab = state.openTabs.find(t => t.path === path);
    if (tab) tab.modified = modified;
    renderTabs();
    if (DOM.statusDot) DOM.statusDot.classList.toggle('modified', modified);
  }

  function showWelcome() {
    DOM.welcomeScreen.style.display = 'flex';
    DOM.codeEditorWrapper.style.display = 'none';
    DOM.markdownWrapper.style.display = 'none';
    DOM.imagePreview.style.display = 'none';
    Object.values(state.editors).forEach(ed => {
      if (ed && ed.getWrapperElement) ed.getWrapperElement().style.display = 'none';
    });
    Object.values(state.mdEditors).forEach(ed => {
      if (ed && ed.getWrapperElement) ed.getWrapperElement().style.display = 'none';
    });
    updateToolbarForFile(null);
    loadRecentFiles();
  }

  /* ───────────── Recent Files ───────────── */
  function loadRecentFiles() {
    if (state.recentFiles.length === 0) {
      DOM.recentFiles.style.display = 'none';
      return;
    }
    DOM.recentFiles.style.display = 'block';
    DOM.recentFilesList.innerHTML = state.recentFiles.slice(0, 8).map(r => {
      const safePath = feEscapeHtml(r.path);
      const safeName = feEscapeHtml(r.name);
      return `
      <div class="recent-file-item" data-path="${safePath}">
        <span>${fileIcon(r.name, false)}</span>
        <div class="recent-file-info">
          <div class="recent-file-name">${safeName}</div>
          <div class="recent-file-meta">${formatTime(r.time)}</div>
          <div class="recent-file-path">${safePath}</div>
        </div>
      </div>
      `;
    }).join('');
    DOM.recentFilesList.querySelectorAll('.recent-file-item').forEach(item => {
      item.addEventListener('click', () => openFile(item.dataset.path));
    });
  }

  /* ───────────── Save ───────────── */
  async function saveCurrentFile() {
    if (!state.activeTab) return;
    const path = state.activeTab;
    const content = state.fileContents[path] !== undefined ? state.fileContents[path] : '';
    const data = await dbGet('files', path);
    if (data) {
      data.content = content;
      data.modified = Date.now();
      data.size = new Blob([content]).size;
      await dbPut('files', data);
      markTabModified(path, false);
      showToast('File saved', 'success', 2000);
    }
  }

  async function autoSaveAll() {
    for (const tab of state.openTabs) {
      if (tab.modified) {
        const content = state.fileContents[tab.path] !== undefined ? state.fileContents[tab.path] : '';
        const data = await dbGet('files', tab.path);
        if (data) {
          data.content = content;
          data.modified = Date.now();
          data.size = new Blob([content]).size;
          await dbPut('files', data);
          markTabModified(tab.path, false);
        }
      }
    }
  }

// ============================================================
// ===== GITMOIRE BRIDGE (MINIMAL REFACTOR) =====
// ============================================================

const GITMOIRE_BRIDGE_KEY = 'ForgeEdit_To_GitMoire';

function feEscapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function feFormatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function feNotify(title, message, type = 'info') {
  try {
    if (typeof showToast === 'function') {
      showToast(title, message, type);
      return;
    }
    if (window.UI && typeof UI.toast === 'function') {
      UI.toast(title, message, type);
      return;
    }
  } catch (_) {}
  console.log(`[${type}] ${title}: ${message}`);
}

function normalizeTargetFolder(path) {
  return String(path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function initGitMoireBridge() {
  const sendBtn = document.getElementById('sendToGitMoireBtn');
  const openBtn = document.getElementById('openGitMoireBtn');

  if (sendBtn && !sendBtn.dataset.gitmoireBound) {
    sendBtn.addEventListener('click', showSendToGitMoireModal);
    sendBtn.dataset.gitmoireBound = '1';
  }

  if (openBtn && !openBtn.dataset.gitmoireBound) {
    openBtn.addEventListener('click', openGitMoireInline);
    openBtn.dataset.gitmoireBound = '1';
  }
}

async function showSendToGitMoireModal() {
  const old = document.getElementById('forgeedit-gitmoire-overlay');
  if (old) old.remove();

  let allFiles = [];
  try {
    allFiles = await dbGetAll('files');
  } catch (err) {
    console.error('[GitMoire Bridge] Failed to read files:', err);
    feNotify('ForgeEdit', 'Gagal membaca file dari IndexedDB.', 'error');
    return;
  }

  const files = (allFiles || []).filter(f =>
    f && f.type === 'file' && typeof f.path === 'string'
  );

  if (!files.length) {
    feNotify('ForgeEdit', 'Tidak ada file yang bisa dikirim.', 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'forgeedit-gitmoire-overlay';

  overlay.innerHTML = `
    <div class="modal wide">
      <div class="modal-header">
        <div class="modal-title">Send to GitMoire</div>
        <button class="modal-close" id="fgm-close" type="button">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Repository</label>
          <input
            class="form-input"
            id="fgm-repo"
            placeholder="contoh: RaaJS"
            autocomplete="off"
          >
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
            ⚠ Pastikan nama repository sesuai dengan repository yang sedang sinkron di GitMoire.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Target Folder</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <span
              id="fgm-repo-prefix"
              style="
                padding:0 10px;
                border:1px solid var(--border-color);
                border-radius:var(--radius-sm);
                background:var(--bg-secondary);
                white-space:nowrap;
              "
            >/</span>

            <input
              class="form-input"
              id="fgm-target-folder"
              placeholder="contoh: docs/examples"
              autocomplete="off"
            >
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Search files</label>
          <input
            class="form-input"
            id="fgm-search"
            placeholder="Type path or filename..."
            autocomplete="off"
          >
        </div>

        <div
          id="fgm-file-list"
          style="
            max-height:52vh;
            overflow:auto;
            border:1px solid var(--border-color);
            border-radius:var(--radius-sm);
            padding:8px;
          "
        ></div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="fgm-cancel" type="button">Cancel</button>
        <button class="btn-primary" id="fgm-open" type="button">Open GitMoire</button>
        <button class="btn-success" id="fgm-send" type="button">Send Selected</button>
        <button class="btn-primary" id="fgm-send-open" type="button">Send & Open</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const listEl = overlay.querySelector('#fgm-file-list');
  const searchEl = overlay.querySelector('#fgm-search');
  const repoEl = overlay.querySelector('#fgm-repo');
  const targetFolderEl = overlay.querySelector('#fgm-target-folder');
  const repoPrefixEl = overlay.querySelector('#fgm-repo-prefix');

  repoEl.addEventListener('input', () => {
    const value = repoEl.value.trim();
    repoPrefixEl.textContent = value ? `${value}/` : '/';
  });

  function renderList(query = '') {
    const q = query.trim().toLowerCase();

    const visible = files.filter(f => {
      const path = String(f.path || '').toLowerCase();
      const name = String(f.name || '').toLowerCase();
      return !q || path.includes(q) || name.includes(q);
    });

    if (!visible.length) {
      listEl.innerHTML = `<div class="tree-empty" style="padding:18px 10px;">No matching files</div>`;
      return;
    }

    listEl.innerHTML = visible.map(f => `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;">
        <input type="checkbox" class="fgm-check" value="${feEscapeHtml(f.path)}" checked style="margin-top:3px;">
        <span style="display:flex;flex-direction:column;min-width:0;flex:1;">
          <span style="font-weight:600;word-break:break-all;">${feEscapeHtml(f.path)}</span>
          <span style="font-size:11px;color:var(--text-muted);">
            ${feEscapeHtml(f.type || 'file')}${typeof f.size === 'number' ? ` · ${feFormatBytes(f.size)}` : ''}
          </span>
        </span>
      </label>
    `).join('');
  }

  function collectSelectedPaths() {
    return Array.from(listEl.querySelectorAll('.fgm-check:checked')).map(el => el.value);
  }

  function closeModal() {
    overlay.remove();
    document.body.style.overflow = '';
  }

  function buildPayload() {
    const selectedPaths = collectSelectedPaths();

    if (!selectedPaths.length) {
      feNotify('ForgeEdit', 'Pilih minimal satu file.', 'warning');
      return null;
    }

    const repository = repoEl.value.trim();
    if (!repository) {
      feNotify('ForgeEdit', 'Nama repository wajib diisi.', 'warning');
      repoEl.focus();
      return null;
    }

    const targetFolder = normalizeTargetFolder(targetFolderEl.value);

    const payloadFiles = files
      .filter(f => selectedPaths.includes(f.path))
      .map(f => ({
        name: f.path,
        content: typeof f.content === 'string' ? f.content : ''
      }));

    return {
      repository,
      targetFolder,
      files: payloadFiles,
      ts: Date.now()
    };
  }

  function sendToBridge(openAfter = false) {
    const payload = buildPayload();
    if (!payload) return;

    try {
      localStorage.setItem(
        GITMOIRE_BRIDGE_KEY,
        JSON.stringify(payload)
      );

      feNotify(
        'ForgeEdit',
        `${payload.files.length} file siap masuk ke GitMoire.`,
        'success'
      );

      closeModal();

      if (openAfter) {
        openGitMoireInline();
      }
    } catch (err) {
      console.error('[GitMoire Bridge] Save failed:', err);
      feNotify('ForgeEdit', 'Gagal menulis bridge ke localStorage.', 'error');
    }
  }

  overlay.querySelector('#fgm-close').onclick = closeModal;
  overlay.querySelector('#fgm-cancel').onclick = closeModal;
  overlay.querySelector('#fgm-send').onclick = () => sendToBridge(false);
  overlay.querySelector('#fgm-send-open').onclick = () => sendToBridge(true);
  overlay.querySelector('#fgm-open').onclick = () => {
    closeModal();
    openGitMoireInline();
  };

  searchEl.addEventListener('input', () => renderList(searchEl.value));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  renderList();
  setTimeout(() => searchEl.focus(), 0);
}

function openGitMoireInline() {
  const old = document.getElementById('forgeedit-gitmoire-inline');
  if (old) {
    old.remove();
    document.body.style.overflow = '';
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'forgeedit-gitmoire-inline';
  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:3000;
    background:rgba(0,0,0,.45);
    backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
    display:flex;
    align-items:stretch;
    justify-content:stretch;
  `;

  overlay.innerHTML = `
    <div style="position:relative;flex:1;margin:12px;border-radius:16px;overflow:hidden;background:var(--bg-secondary);box-shadow:0 16px 60px rgba(0,0,0,.45);border:1px solid var(--border-color);">
      <button id="fgm-inline-close" type="button" style="position:absolute;top:10px;right:10px;z-index:2;width:34px;height:34px;border:none;border-radius:10px;background:rgba(0,0,0,.35);color:#fff;cursor:pointer;font-size:18px;">✕</button>
      <iframe
        src="/experimentals/apps/gitmoire.html"
        style="width:100%;height:100%;border:0;background:#fff;"
        title="GitMoire"
      ></iframe>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#fgm-inline-close').onclick = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      document.body.style.overflow = '';
    }
  });
}
   
  /* ───────────── Toolbar ───────────── */
  function updateToolbarForFile(name) {
    const isMD = name && isMarkdownFile(name);
    const isCode = name && !isMD && !isImageFile(name);
    const isImg = name && isImageFile(name);
    DOM.formatToolbar.style.display = isMD ? 'flex' : 'none';
    DOM.viewToolbar.style.display = isMD ? 'flex' : 'none';
    DOM.codeToolbar.style.display = isCode ? 'flex' : 'none';
  }

  function getActiveEditor() {
    if (!state.activeTab) return null;
    const name = state.openTabs.find(t => t.path === state.activeTab)?.name || '';
    if (isMarkdownFile(name)) return state.mdEditors[state.activeTab];
    return state.editors[state.activeTab];
  }

  /* ───────────── Status Bar ───────────── */
  function updateStatusBar() {
    const ed = getActiveEditor();
    if (ed) {
      const cur = ed.getCursor();
      const sel = ed.getSelection();
      if (DOM.statusLine) DOM.statusLine.textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
      if (DOM.statusSelection) DOM.statusSelection.textContent = sel ? `(${sel.length} selected)` : '';
    } else {
      if (DOM.statusLine) DOM.statusLine.textContent = 'Ln 1, Col 1';
      if (DOM.statusSelection) DOM.statusSelection.textContent = '';
    }
    const tab = state.openTabs.find(t => t.path === state.activeTab);
    if (DOM.statusFileType) DOM.statusFileType.textContent = tab ? getFileTypeName(tab.name) : 'Plain Text';
    if (DOM.statusSpaces) DOM.statusSpaces.textContent = `Spaces: ${state.settings.tabSize}`;
    if (DOM.statusEOL) DOM.statusEOL.textContent = 'LF';
    if (DOM.statusDot) DOM.statusDot.classList.toggle('modified', !!tab?.modified);
  }

  /* ───────────── Modals ───────────── */
  function openModal(el) { el.classList.add('active'); }
  function closeModal(el) { el.classList.remove('active'); }

  // New File Modal
  async function openNewFileModal() {
    DOM.newFileName.value = 'untitled.txt';
    const allFolders = (await dbGetAll('files')).filter(f => f.type === 'folder');
    const paths = ['/', ...allFolders.map(f => f.path)];
    DOM.newFileLocation.innerHTML = paths.map(p => { const safePath = feEscapeHtml(p); return `<option value="${safePath}">${safePath}</option>`; }).join('');
    DOM.newFileType.innerHTML = [
      'txt', 'html', 'css', 'js', 'ts', 'json', 'md', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp',
      'php', 'sql', 'sh', 'yaml', 'xml', 'dockerfile', 'vue', 'jsx', 'tsx', 'sass', 'less', 'env'
    ].map(t => `<option value="${t}">.${t}</option>`).join('');
    DOM.newFileType.onchange = () => {
      const ext = DOM.newFileType.value;
      DOM.newFileName.value = `untitled.${ext}`;
    };
    openModal(DOM.newFileModal);
    DOM.newFileName.focus();
    DOM.newFileName.select();
  }

  async function createNewFileAction() {
    const name = DOM.newFileName.value.trim();
    const location = DOM.newFileLocation.value;
    const ext = DOM.newFileType.value;
    if (!name) { showToast('File name is required', 'warning'); return; }
    const path = location === '/' ? name : `${location}/${name}`;
    const existing = await dbGet('files', path);
    if (existing) { showToast('File already exists', 'warning'); return; }
    const parent = location;
    // Ensure parent folder exists
    if (parent !== '/') {
      const parentData = await dbGet('files', parent);
      if (!parentData) {
        await dbPut('files', { path: parent, name: getFileName(parent), type: 'folder', parent: getParentPath(parent), open: true, modified: Date.now() });
      }
    }
    await dbPut('files', {
      path, name, type: 'file', parent, content: '',
      size: 0, modified: Date.now(), created: Date.now(), open: false
    });
    closeModal(DOM.newFileModal);
    await loadFileTree();
    await openFile(path);
    showToast('File created', 'success');
  }

  // New Folder Modal
  async function openNewFolderModal() {
    DOM.newFolderName.value = 'new-folder';
    const allFolders = (await dbGetAll('files')).filter(f => f.type === 'folder');
    DOM.newFolderLocation.innerHTML = paths.map(p => { const safePath = feEscapeHtml(p); return `<option value="${safePath}">${safePath}</option>`; }).join('');
    DOM.newFolderLocation.innerHTML = paths.map(p => `<option value="${p}">${p}</option>`).join('');
    openModal(DOM.newFolderModal);
    DOM.newFolderName.focus();
    DOM.newFolderName.select();
  }

  async function createNewFolderAction() {
    const name = DOM.newFolderName.value.trim();
    const location = DOM.newFolderLocation.value;
    if (!name) { showToast('Folder name is required', 'warning'); return; }
    const path = location === '/' ? name : `${location}/${name}`;
    const existing = await dbGet('files', path);
    if (existing) { showToast('Folder already exists', 'warning'); return; }
    await dbPut('files', {
      path, name, type: 'folder', parent: location, open: true, modified: Date.now(), created: Date.now()
    });
    // Also ensure parent folder open
    if (location !== '/') {
      const parentData = await dbGet('files', location);
      if (parentData) { parentData.open = true; await dbPut('files', parentData); }
    }
    closeModal(DOM.newFolderModal);
    await loadFileTree();
    showToast('Folder created', 'success');
  }

  // Rename Modal
  let renamePath = null;
  function openRenameModal(path) {
    renamePath = path;
    DOM.renameInput.value = getFileName(path);
    openModal(DOM.renameModal);
    DOM.renameInput.focus();
    DOM.renameInput.select();
  }

  async function confirmRenameAction() {
    if (!renamePath) return;
    const newName = DOM.renameInput.value.trim();
    if (!newName) { showToast('Name is required', 'warning'); return; }
    const oldPath = renamePath;
    const parentPath = getParentPath(oldPath);
    const newPath = parentPath === '/' ? newName : `${parentPath}/${newName}`;

    const data = await dbGet('files', oldPath);
    if (!data) { closeModal(DOM.renameModal); return; }

    // Check if new path exists
    const existing = await dbGet('files', newPath);
    if (existing && newPath !== oldPath) { showToast('Name already exists', 'warning'); return; }

    // Update content mapping
    if (state.fileContents[oldPath] !== undefined) {
      state.fileContents[newPath] = state.fileContents[oldPath];
      delete state.fileContents[oldPath];
    }

    // Update editor mapping
    if (state.editors[oldPath]) {
      state.editors[newPath] = state.editors[oldPath];
      delete state.editors[oldPath];
    }
    if (state.mdEditors[oldPath]) {
      state.mdEditors[newPath] = state.mdEditors[oldPath];
      delete state.mdEditors[oldPath];
    }

    // Update tab
    const tab = state.openTabs.find(t => t.path === oldPath);
    if (tab) { tab.path = newPath; tab.name = newName; }
    if (state.activeTab === oldPath) state.activeTab = newPath;

    // Rename children
    const allFiles = await dbGetAll('files');
    for (const f of allFiles) {
      if (f.path === oldPath || f.path.startsWith(oldPath + '/')) {
        const childNewPath = newPath + f.path.slice(oldPath.length);
        const childData = await dbGet('files', f.path);
        if (childData) {
          childData.path = childNewPath;
          childData.name = getFileName(childNewPath);
          childData.parent = getParentPath(childNewPath) || '/';
          await dbPut('files', childData);
          if (f.path !== oldPath) await dbDelete('files', f.path);
        }
      }
    }

    // Save new entry
    data.path = newPath;
    data.name = newName;
    data.parent = parentPath;
    await dbPut('files', data);
    if (newPath !== oldPath) await dbDelete('files', oldPath);

    closeModal(DOM.renameModal);
    renamePath = null;
    renderTabs();
    await loadFileTree();
    showToast('Renamed successfully', 'success');
  }

  // Export Modal
  function openExportModal() {
    if (!state.activeTab) return;
    openModal(DOM.exportModal);
  }

  async function confirmExportAction() {
    const format = DOM.exportFormat.value;
    const path = state.activeTab;
    const content = state.fileContents[path] || '';
    const tab = state.openTabs.find(t => t.path === path);
    const name = tab?.name || 'export';

    if (format === 'pdf') {
      window.print();
      closeModal(DOM.exportModal);
      return;
    }

    let blob, filename;
    if (format === 'html' && isMarkdownFile(name)) {
      const md = (window.markdownit || markdownit)({ html: true });
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}pre{background:#f5f5f5;padding:16px;overflow-x:auto;border-radius:8px}code{background:#f5f5f5;padding:2px 6px;border-radius:4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}img{max-width:100%}</style></head><body>${md.render(content)}</body></html>`;
      blob = new Blob([html], { type: 'text/html' });
      filename = name.replace(/\.\w+$/, '.html');
    } else if (format === 'md') {
      blob = new Blob([content], { type: 'text/markdown' });
      filename = name.replace(/\.\w+$/, '.md');
    } else {
      blob = new Blob([content], { type: 'text/plain' });
      filename = name.replace(/\.\w+$/, '.txt');
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    closeModal(DOM.exportModal);
    showToast('Exported successfully', 'success');
  }

  /* ───────────── Settings UI ───────────── */
  function populateSettings() {
    const s = state.settings;
    DOM.settingTheme.value = s.theme;
    DOM.settingEditorTheme.value = s.editorTheme;
    DOM.settingFontSize.value = s.fontSize;
    DOM.fontSizeValue.textContent = s.fontSize;
    DOM.settingLineHeight.value = s.lineHeight;
    DOM.lineHeightValue.textContent = s.lineHeight;
    setToggle(DOM.settingLineNumbers, s.lineNumbers);
    setToggle(DOM.settingActiveLine, s.activeLine);
    setToggle(DOM.settingMatchBrackets, s.matchBrackets);
    setToggle(DOM.settingAutoCloseBrackets, s.autoCloseBrackets);
    setToggle(DOM.settingWordWrap, s.wordWrap);
    setToggle(DOM.settingShowWhitespace, s.showWhitespace);
    setToggle(DOM.settingScrollPastEnd, s.scrollPastEnd);
    DOM.settingKeyMap.value = s.keyMap;
    DOM.settingTabSize.value = s.tabSize;
    setToggle(DOM.settingInsertSpaces, s.insertSpaces);
    setToggle(DOM.settingAutoSave, s.autoSave);
    setToggle(DOM.settingAutoFold, s.autoFold);
    updateStorageInfo();
  }

  function setToggle(el, val) {
    if (el) el.classList.toggle('active', val);
  }

  function getToggle(el) {
    return el ? el.classList.contains('active') : false;
  }

  function collectSettings() {
    state.settings.theme = DOM.settingTheme.value;
    state.settings.editorTheme = DOM.settingEditorTheme.value;
    state.settings.fontSize = parseInt(DOM.settingFontSize.value);
    state.settings.lineHeight = parseFloat(DOM.settingLineHeight.value);
    state.settings.lineNumbers = getToggle(DOM.settingLineNumbers);
    state.settings.activeLine = getToggle(DOM.settingActiveLine);
    state.settings.matchBrackets = getToggle(DOM.settingMatchBrackets);
    state.settings.autoCloseBrackets = getToggle(DOM.settingAutoCloseBrackets);
    state.settings.wordWrap = getToggle(DOM.settingWordWrap);
    state.settings.showWhitespace = getToggle(DOM.settingShowWhitespace);
    state.settings.scrollPastEnd = getToggle(DOM.settingScrollPastEnd);
    state.settings.keyMap = DOM.settingKeyMap.value;
    state.settings.tabSize = parseInt(DOM.settingTabSize.value);
    state.settings.insertSpaces = getToggle(DOM.settingInsertSpaces);
    state.settings.autoSave = getToggle(DOM.settingAutoSave);
    state.settings.autoFold = getToggle(DOM.settingAutoFold);
  }

  async function applySettings() {
    applyTheme();
    applyEditorTheme();
    const s = state.settings;
    Object.values(state.editors).forEach(ed => {
      if (!ed) return;
      ed.setOption('lineNumbers', s.lineNumbers);
      ed.setOption('lineWrapping', s.wordWrap);
      ed.setOption('matchBrackets', s.matchBrackets);
      ed.setOption('autoCloseBrackets', s.autoCloseBrackets);
      ed.setOption('styleActiveLine', s.activeLine);
      ed.setOption('showTrailingSpace', s.showWhitespace);
      ed.setOption('scrollPastEnd', s.scrollPastEnd);
      ed.setOption('tabSize', s.tabSize);
      ed.setOption('indentWithTabs', !s.insertSpaces);
      ed.setOption('keyMap', s.keyMap);
      ed.setOption('indentUnit', s.tabSize);
    });
    Object.values(state.mdEditors).forEach(ed => {
      if (!ed) return;
      ed.setOption('lineNumbers', s.lineNumbers);
      ed.setOption('tabSize', s.tabSize);
      ed.setOption('indentWithTabs', !s.insertSpaces);
      ed.setOption('keyMap', s.keyMap);
    });
    // Apply font size
    document.querySelectorAll('.CodeMirror').forEach(cm => {
      cm.style.fontSize = s.fontSize + 'px';
      cm.style.lineHeight = String(s.lineHeight);
    });
    // Refresh all
    Object.values(state.editors).forEach(ed => ed && ed.refresh());
    Object.values(state.mdEditors).forEach(ed => ed && ed.refresh());
    updateStatusBar();
  }

  async function updateStorageInfo() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const used = est.usage || 0;
        const total = est.quota || 0;
        DOM.storageUsed.textContent = formatSize(used);
        DOM.storageUsedDesc.textContent = `${formatSize(used)} of ${formatSize(total)}`;
      } else {
        const allFiles = await dbGetAll('files');
        const totalSize = allFiles.reduce((s, f) => s + (f.size || 0), 0);
        DOM.storageUsed.textContent = formatSize(totalSize);
        DOM.storageUsedDesc.textContent = `Approximately ${formatSize(totalSize)}`;
      }
    } catch (e) {
      DOM.storageUsed.textContent = 'N/A';
      DOM.storageUsedDesc.textContent = 'Unable to calculate';
    }
  }

  /* ───────────── Find & Replace ───────────── */
  function toggleFindPanel(show) {
    if (show) {
      DOM.findPanel.classList.add('active');
      DOM.findInput.focus();
    } else {
      DOM.findPanel.classList.remove('active');
      const ed = getActiveEditor();
      if (ed) ed.focus();
    }
  }

  let searchState = { pos: 0, matches: [] };

  function doFind(direction) {
    const ed = getActiveEditor();
    if (!ed) return;
    const query = DOM.findInput.value;
    if (!query) { DOM.findStatus.textContent = ''; return; }

    const caseSensitive = DOM.findCaseSensitive.checked;
    const wholeWord = DOM.findWholeWord.checked;
    const useRegex = DOM.findRegex.checked;

    let searchQuery;
    try {
      if (useRegex) {
        searchQuery = new RegExp(query, caseSensitive ? '' : 'i');
      } else {
        let q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) q = `\\b${q}\\b`;
        searchQuery = new RegExp(q, caseSensitive ? '' : 'i');
      }
    } catch (e) {
      DOM.findStatus.textContent = 'Invalid regex';
      return;
    }

    const cur = ed.getCursor();
    const curLine = direction > 0 ? cur.line : cur.line;
    const curCh = direction > 0 ? cur.ch + 1 : cur.ch - 1;

    const state = ed.state.search || {};
    if (!state.query || state.query.source !== searchQuery.source) {
      // New search
      CodeMirror.commands.clearSearch(ed);
      ed.state.search = { query: searchQuery };
    }

    // Use CodeMirror's built-in search
    if (typeof ed.getSearchCursor === 'function') {
      const cursor = ed.getSearchCursor(searchQuery, direction > 0 ? cur : cur);
      if (direction > 0) {
        if (!cursor.findNext()) {
          cursor = ed.getSearchCursor(searchQuery); // wrap around
          if (!cursor.findNext()) { DOM.findStatus.textContent = 'No matches'; return; }
        }
      } else {
        if (!cursor.findPrevious()) {
          cursor = ed.getSearchCursor(searchQuery, ed.lastLine());
          if (!cursor.findPrevious()) { DOM.findStatus.textContent = 'No matches'; return; }
        }
      }
      ed.setSelection(cursor.from(), cursor.to());
      ed.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 50);
      // Count matches
      let count = 0;
      const countCursor = ed.getSearchCursor(searchQuery);
      while (countCursor.findNext()) count++;
      DOM.findStatus.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
    }
  }

  function doReplace() {
    const ed = getActiveEditor();
    if (!ed) return;
    const query = DOM.findInput.value;
    const replacement = DOM.replaceInput.value;
    if (!query) return;

    const cursor = ed.getCursor();
    const caseSensitive = DOM.findCaseSensitive.checked;
    const useRegex = DOM.findRegex.checked;
    const wholeWord = DOM.findWholeWord.checked;

    let searchQuery;
    try {
      if (useRegex) {
        searchQuery = new RegExp(query, caseSensitive ? '' : 'i');
      } else {
        let q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) q = `\\b${q}\\b`;
        searchQuery = new RegExp(q, caseSensitive ? '' : 'i');
      }
    } catch (e) { return; }

    const sc = ed.getSearchCursor(searchQuery, cursor);
    if (sc.findNext()) {
      const from = sc.from(), to = sc.to();
      const match = ed.getRange(from, to);
      sc.replace(replacement);
      ed.setSelection(sc.from(), sc.to());
      doFind(1);
      showToast('Replaced 1 occurrence', 'info', 1500);
    }
  }

  function doReplaceAll() {
    const ed = getActiveEditor();
    if (!ed) return;
    const query = DOM.findInput.value;
    const replacement = DOM.replaceInput.value;
    if (!query) return;

    const caseSensitive = DOM.findCaseSensitive.checked;
    const useRegex = DOM.findRegex.checked;
    const wholeWord = DOM.findWholeWord.checked;

    let searchQuery;
    try {
      if (useRegex) {
        searchQuery = new RegExp(query, caseSensitive ? 'g' : 'gi');
      } else {
        let q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (wholeWord) q = `\\b${q}\\b`;
        searchQuery = new RegExp(q, caseSensitive ? 'g' : 'gi');
      }
    } catch (e) { return; }

    const content = ed.getValue();
    const matches = content.match(searchQuery);
    const count = matches ? matches.length : 0;
    if (count === 0) { DOM.findStatus.textContent = 'No matches'; return; }

    const newContent = content.replace(searchQuery, replacement);
    ed.setValue(newContent);
    DOM.findStatus.textContent = `Replaced ${count} occurrence${count !== 1 ? 's' : ''}`;
    showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
  }

  /* ───────────── Command Palette ───────────── */
  const commands = [
    { name: 'New File', icon: '&#128196;', shortcut: 'Ctrl+N', action: () => openNewFileModal() },
    { name: 'New Folder', icon: '&#128193;', action: () => openNewFolderModal() },
    { name: 'Open File', icon: '&#128194;', shortcut: 'Ctrl+O', action: () => DOM.fileInput.click() },
    { name: 'Save File', icon: '&#128190;', shortcut: 'Ctrl+S', action: () => saveCurrentFile() },
    { name: 'Find & Replace', icon: '&#128269;', shortcut: 'Ctrl+F', action: () => toggleFindPanel(true) },
    { name: 'Toggle Sidebar', icon: '&#128203;', shortcut: 'Ctrl+B', action: () => toggleSidebar() },
    { name: 'Settings', icon: '&#9881;', shortcut: 'Ctrl+,', action: () => { populateSettings(); openModal(DOM.settingsModal); } },
    { name: 'Toggle Theme', icon: '&#127769;', action: () => cycleTheme() },
    { name: 'Keyboard Shortcuts', icon: '&#9000;', action: () => openModal(DOM.shortcutsModal) },
    { name: 'Code Snippets', icon: '&#128221;', action: () => { renderSnippets(); openModal(DOM.snippetsModal); } },
    { name: 'Export File', icon: '&#128229;', action: () => openExportModal() },
    { name: 'Format Code', icon: '&#128312;', shortcut: 'Alt+Shift+F', action: () => formatCode() },
    { name: 'Minify Code', icon: '&#128315;', action: () => minifyCode() },
    { name: 'Close Tab', icon: '&#10005;', shortcut: 'Ctrl+W', action: () => state.activeTab && closeTab(state.activeTab) },
    { name: 'Toggle Preview', icon: '&#128065;', shortcut: 'Ctrl+Shift+P', action: () => openPreview() },
    { name: 'Split View', icon: '&#128473;', action: () => setMarkdownView('split') },
    { name: 'Go to Line', icon: '&#8595;', shortcut: 'Ctrl+G', action: () => { const ed = getActiveEditor(); if (ed) CodeMirror.commands.jumpToLine(ed); } },
  ];

  function showCommandPalette() {
    DOM.commandPalette.classList.add('active');
    DOM.commandInput.value = '';
    renderCommands('');
    DOM.commandInput.focus();
  }

  function hideCommandPalette() {
    DOM.commandPalette.classList.remove('active');
    DOM.commandInput.value = '';
  }

  let selectedCmd = 0;

  function renderCommands(query) {
    const q = query.toLowerCase();
    const filtered = commands.filter(c => c.name.toLowerCase().includes(q));
    selectedCmd = 0;
    DOM.commandResults.innerHTML = filtered.map((c, i) => `
      <div class="command-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
        <span>${c.icon}</span>
        <span class="command-name">${c.name}</span>
        ${c.shortcut ? `<span class="command-shortcut">${c.shortcut}</span>` : ''}
      </div>
    `).join('') || '<div class="command-empty">No commands found</div>';

    DOM.commandResults.querySelectorAll('.command-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        executeCommand(filtered, idx);
      });
    });
  }

  function executeCommand(filtered, idx) {
    if (filtered[idx]) {
      hideCommandPalette();
      filtered[idx].action();
    }
  }

  /* ───────────── Context Menu ───────────── */
  function showContextMenu(e, path, type) {
    e.preventDefault();
    const items = [
      { label: 'Open', action: () => type === 'folder' ? toggleFolder(path) : openFile(path) },
      { label: 'Rename', action: () => openRenameModal(path) },
      { type: 'divider' },
      { label: 'Delete', danger: true, action: async () => {
        if (confirm(`Delete "${getFileName(path)}"?`)) {
          await deleteNode(path, type);
          closeTab(path);
          await loadFileTree();
          showToast('Deleted', 'success');
        }
      }},
    ];
    if (type === 'file') {
      items.splice(2, 0, { label: 'Duplicate', action: async () => {
        const data = await dbGet('files', path);
        if (data) {
          const ext = getExt(data.name);
          const base = data.name.replace(/\.\w+$/, '');
          const newName = `${base}-copy.${ext}`;
          const newPath = getParentPath(path) === '/' ? newName : `${getParentPath(path)}/${newName}`;
          await dbPut('files', { ...data, path: newPath, name: newName, modified: Date.now(), created: Date.now() });
          await loadFileTree();
          showToast('Duplicated', 'success');
        }
      }});
    }
    if (type === 'folder') {
      items.splice(2, 0, { label: 'New File', action: () => openNewFileModal() });
      items.splice(3, 0, { label: 'New Folder', action: () => openNewFolderModal() });
    }
    DOM.contextMenu.innerHTML = items.map(item => {
      if (item.type === 'divider') return '<div class="context-divider"></div>';
      return `<div class="context-item ${item.danger ? 'danger' : ''}" data-action="${item.label}">${item.label}</div>`;
    }).join('');
    DOM.contextMenu.querySelectorAll('.context-item').forEach((el, i) => {
      const item = items.filter(it => it.type !== 'divider')[i];
      if (item) el.addEventListener('click', () => { hideContextMenu(); item.action(); });
    });
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    DOM.contextMenu.style.left = x + 'px';
    DOM.contextMenu.style.top = y + 'px';
    DOM.contextMenu.classList.add('active');
  }

  function hideContextMenu() { DOM.contextMenu.classList.remove('active'); }

  /* ───────────── Markdown View ───────────── */
  function togglePreview() {
    if (state.markdownView === 'preview') setMarkdownView('split');
    else setMarkdownView('preview');
  }

  function setMarkdownView(mode) {
    state.markdownView = mode;
    const edPane = DOM.markdownEditorPane;
    const pvPane = DOM.markdownPreviewPane;
    const resize = DOM.splitResize;

    if (mode === 'editor') {
      edPane.style.display = 'flex'; pvPane.style.display = 'none'; resize.style.display = 'none';
    } else if (mode === 'preview') {
      edPane.style.display = 'none'; pvPane.style.display = 'flex'; resize.style.display = 'none';
    } else {
      edPane.style.display = 'flex'; pvPane.style.display = 'flex'; resize.style.display = 'block';
    }
    const ed = state.mdEditors[state.activeTab];
    if (ed) setTimeout(() => ed.refresh(), 50);
  }

  /* ───────────── Code Formatting ───────────── */
  function formatCode() {
    const ed = getActiveEditor();
    if (!ed) return;
    const tab = state.openTabs.find(t => t.path === state.activeTab);
    if (!tab) return;
    const ext = getExt(tab.name);

    if (['json'].includes(ext)) {
      try {
        const formatted = JSON.stringify(JSON.parse(ed.getValue()), null, state.settings.tabSize);
        ed.setValue(formatted);
        showToast('Formatted JSON', 'success');
      } catch (e) {
        showToast('Invalid JSON: ' + e.message, 'error');
      }
    } else if (['html', 'htm', 'xml', 'svg'].includes(ext)) {
      try {
        const formatted = simpleHTMLFormat(ed.getValue(), state.settings.tabSize);
        ed.setValue(formatted);
        showToast('Formatted HTML', 'success');
      } catch (e) {
        showToast('Format error', 'error');
      }
    } else if (['css', 'scss', 'less', 'sass'].includes(ext)) {
      try {
        const formatted = simpleCSSFormat(ed.getValue(), state.settings.tabSize);
        ed.setValue(formatted);
        showToast('Formatted CSS', 'success');
      } catch (e) {
        showToast('Format error', 'error');
      }
    } else {
      showToast('Auto-format not available for this file type. Try JSON/HTML/CSS.', 'info');
    }
  }

  function simpleHTMLFormat(html, tab) {
    let result = '';
    let indent = 0;
    const sp = ' '.repeat(tab);
    html.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).forEach(token => {
      if (!token.trim()) return;
      if (/^<\/\w/.test(token)) { indent = Math.max(0, indent - 1); result += sp.repeat(indent) + token.trim() + '\n'; }
      else if (/^<\w[^>]*[^/]>.*<\/\w+>$/.test(token)) { result += sp.repeat(indent) + token.trim() + '\n'; }
      else if (/^<\w[^>]*\/>/.test(token)) { result += sp.repeat(indent) + token.trim() + '\n'; }
      else if (/^<\w/.test(token)) { result += sp.repeat(indent) + token.trim() + '\n'; indent++; }
      else { result += sp.repeat(indent) + token.trim() + '\n'; }
    });
    return result.trim();
  }

  function simpleCSSFormat(css, tab) {
    const sp = ' '.repeat(tab);
    let indent = 0;
    return css.replace(/\s*{\s*/g, ' {\n' + sp).replace(/\s*}\s*/g, '\n}\n\n')
      .replace(/;\s*/g, ';\n' + sp).replace(/\n\s*\n/g, '\n\n').trim();
  }

  function minifyCode() {
    const ed = getActiveEditor();
    if (!ed) return;
    const tab = state.openTabs.find(t => t.path === state.activeTab);
    if (!tab) return;
    const ext = getExt(tab.name);

    let content = ed.getValue();
    if (['json'].includes(ext)) {
      try {
        content = JSON.stringify(JSON.parse(content));
      } catch (e) { showToast('Invalid JSON', 'error'); return; }
    } else {
      content = content.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    ed.setValue(content);
    showToast('Minified', 'success');
  }

  /* ───────────── Theme Cycling ───────────── */
  function cycleTheme() {
    const themes = ['dark', 'light', 'midnight', 'ocean', 'forest', 'sunset'];
    const idx = themes.indexOf(state.settings.theme);
    state.settings.theme = themes[(idx + 1) % themes.length];
    applyTheme();
    saveSettingsToDB();
    showToast(`Theme: ${state.settings.theme}`, 'info');
  }

  /* ───────────── Markdown Toolbar ───────────── */
  function insertMarkdown(action) {
    const ed = state.mdEditors[state.activeTab];
    if (!ed) return;
    const cur = ed.getCursor();
    const sel = ed.getSelection();
    let insert = '';
    switch (action) {
      case 'bold': insert = sel ? `**${sel}**` : '**bold text**'; break;
      case 'italic': insert = sel ? `*${sel}*` : '*italic text*'; break;
      case 'heading': insert = sel ? `## ${sel}` : '## Heading'; break;
      case 'link': insert = sel ? `[${sel}](url)` : '[link text](url)'; break;
      case 'image': insert = sel ? `![${sel}](url)` : '![alt text](url)'; break;
      case 'code': insert = sel ? `\`\`\`\n${sel}\n\`\`\`` : '```\ncode\n```'; break;
      case 'quote': insert = sel ? sel.split('\n').map(l => `> ${l}`).join('\n') : '> Quote'; break;
      case 'list': insert = sel ? sel.split('\n').map(l => `- ${l}`).join('\n') : '- Item 1\n- Item 2'; break;
      case 'table': insert = '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell 1 | Cell 2 | Cell 3 |'; break;
    }
    if (sel) {
      ed.replaceSelection(insert);
    } else {
      ed.replaceRange(insert, cur);
    }
    ed.focus();
    renderMarkdownPreview(state.activeTab);
  }

  /* ───────────── Snippets ───────────── */
  function renderSnippets() {
    DOM.snippetsList.innerHTML = state.snippets.map(s => `
      <div class="snippet-item" style="padding:12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;cursor:pointer">
        <div style="font-weight:600;margin-bottom:4px">${s.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${s.lang}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" data-insert="${s.id}">Insert</button>
          <button class="btn btn-danger btn-sm" data-delete="${s.id}">Delete</button>
        </div>
      </div>
    `).join('');
    DOM.snippetsList.querySelectorAll('[data-insert]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snippet = state.snippets.find(s => s.id === btn.dataset.insert);
        if (snippet) {
          const ed = getActiveEditor();
          if (ed) {
            ed.replaceSelection(snippet.code);
            ed.focus();
            closeModal(DOM.snippetsModal);
            showToast('Snippet inserted', 'success');
          }
        }
      });
    });
    DOM.snippetsList.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.snippets = state.snippets.filter(s => s.id !== btn.dataset.delete);
        saveSnippetsToDB();
        renderSnippets();
        showToast('Snippet deleted', 'info');
      });
    });
  }

  /* ───────────── Split Resize ───────────── */
  function initSplitResize() {
    let isDragging = false;
    const splitView = $('#splitView');

    DOM.splitResize.addEventListener('mousedown', (e) => {
      isDragging = true;
      DOM.splitResize.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = splitView.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
      DOM.markdownEditorPane.style.flex = `0 0 ${pct}%`;
      DOM.markdownPreviewPane.style.flex = `0 0 ${100 - pct}%`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        DOM.splitResize.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const ed = state.mdEditors[state.activeTab];
        if (ed) ed.refresh();
      }
    });
  }

  /* ───────────── Drag & Drop ───────────── */
  function initDragDrop() {
    let dragCount = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCount++;
      DOM.dragOverlay.classList.add('active');
    });
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCount--;
      if (dragCount <= 0) { dragCount = 0; DOM.dragOverlay.classList.remove('active'); }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCount = 0;
      DOM.dragOverlay.classList.remove('active');
      const files = e.dataTransfer.files;
      if (files.length === 0) return;
      for (const file of files) {
        await importFile(file);
      }
      await loadFileTree();
      showToast(`Imported ${files.length} file(s)`, 'success');
    });
  }

  async function importFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        const path = file.name;
        const parent = '/';
        await dbPut('files', {
          path, name: file.name, type: 'file', parent,
          content, size: file.size, modified: Date.now(), created: Date.now(), open: false
        });
        resolve();
      };
      if (isImageFile(file.name)) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  /* ───────────── Data Export/Import ───────────── */
  async function exportAllDataAction() {
    try {
      const allFiles = await dbGetAll('files');
      const data = JSON.stringify({ version: 1, files: allFiles, exported: Date.now() }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `forgeedit-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Data exported', 'success');
    } catch (e) {
      showToast('Export failed: ' + e.message, 'error');
    }
  }

  async function importDataAction() {
    DOM.importInput.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.files && Array.isArray(data.files)) {
        for (const f of data.files) {
          await dbPut('files', f);
        }
        await loadFileTree();
        showToast(`Imported ${data.files.length} items`, 'success');
      } else {
        showToast('Invalid backup format', 'error');
      }
    } catch (e) {
      showToast('Import failed: ' + e.message, 'error');
    }
    DOM.importInput.value = '';
  }

  async function clearAllDataAction() {
    if (!confirm('This will permanently delete ALL your files and data. Are you sure?')) return;
    if (!confirm('This action cannot be undone. Continue?')) return;
    try {
      const tx = db.transaction(['files', 'settings', 'snippets'], 'readwrite');
      tx.objectStore('files').clear();
      tx.objectStore('settings').clear();
      tx.objectStore('snippets').clear();
      state.openTabs = [];
      state.activeTab = null;
      state.fileContents = {};
      Object.keys(state.editors).forEach(k => { const el = state.editors[k]?.getWrapperElement(); if (el?.parentNode) el.parentNode.removeChild(el); });
      state.editors = {};
      Object.keys(state.mdEditors).forEach(k => { const el = state.mdEditors[k]?.getWrapperElement(); if (el?.parentNode) el.parentNode.removeChild(el); });
      state.mdEditors = {};
      state.recentFiles = [];
      renderTabs();
      showWelcome();
      await loadFileTree();
      showToast('All data cleared', 'success');
    } catch (e) {
      showToast('Clear failed: ' + e.message, 'error');
    }
  }

  /* ───────────── File Input Handlers ───────────── */
  async function handleFileInput(e) {
    const files = e.target.files;
    for (const file of files) {
      await importFile(file);
    }
    await loadFileTree();
    // Open the first file
    if (files.length > 0) {
      await openFile(files[0].name);
    }
    DOM.fileInput.value = '';
  }

  async function handleFolderInput(e) {
    const files = e.target.files;
    for (const file of files) {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/');
      // Create folder entries
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        const existing = await dbGet('files', folderPath);
        if (!existing) {
          await dbPut('files', {
            path: folderPath, name: parts[i], type: 'folder',
            parent: i === 0 ? '/' : parts.slice(0, i).join('/'),
            open: true, modified: Date.now(), created: Date.now()
          });
        }
      }
      // Create file entry
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          await dbPut('files', {
            path, name: parts[parts.length - 1], type: 'file',
            parent: parentPath, content: ev.target.result,
            size: file.size, modified: Date.now(), created: Date.now(), open: false
          });
          resolve();
        };
        reader.readAsText(file);
      });
    }
    await loadFileTree();
    DOM.folderInput.value = '';
    showToast(`Imported folder with ${files.length} files`, 'success');
  }

  /* ───────────── Sidebar Search ───────────── */
  function initSidebarSearch() {
    DOM.sidebarSearch.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = DOM.fileTree.querySelectorAll('.file-tree-item');
      items.forEach(item => {
        const name = item.querySelector('.file-name')?.textContent.toLowerCase() || '';
        const path = item.dataset.path.toLowerCase();
        const match = !query || name.includes(query) || path.includes(query);
        item.style.display = match ? '' : 'none';
        // Show parent folders of matching files
        if (match && query) {
          let parent = item.parentElement;
          while (parent && parent !== DOM.fileTree) {
            if (parent.classList.contains('file-tree-children') || parent.classList.contains('file-tree-item')) {
              parent.style.display = '';
            }
            parent = parent.parentElement;
          }
        }
      });
    });
  }

  /* ───────────── Keyboard Shortcuts ───────────── */
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // Command Palette
      if (ctrl && e.key === 'k') { e.preventDefault(); showCommandPalette(); return; }
      if (ctrl && e.key === ',') { e.preventDefault(); populateSettings(); openModal(DOM.settingsModal); return; }

      // File operations
      if (ctrl && e.key === 'n') { e.preventDefault(); openNewFileModal(); return; }
      if (ctrl && e.key === 'o') { e.preventDefault(); DOM.fileInput.click(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); saveCurrentFile(); return; }

      // View
      if (ctrl && e.key === 'b' && !getActiveEditor()?.state?.completionActive) {
        // Only toggle if not in editor or not triggering bold
        if (!state.activeTab || !isMarkdownFile(state.openTabs.find(t => t.path === state.activeTab)?.name)) {
          e.preventDefault(); toggleSidebar(); return;
        }
      }
      if (ctrl && e.key === 'p') {
        const tab = state.openTabs.find(t => t.path === state.activeTab);
        if (tab && isMarkdownFile(tab.name)) { e.preventDefault(); togglePreview(); return; }
      }

      // Find
      if (ctrl && e.key === 'f') { e.preventDefault(); toggleFindPanel(true); return; }
      if (ctrl && e.key === 'h') { e.preventDefault(); toggleFindPanel(true); return; }

      // Tab close
      if (ctrl && e.key === 'w') { e.preventDefault(); if (state.activeTab) closeTab(state.activeTab); return; }

      // Format
      if (alt && shift && e.key === 'F') { e.preventDefault(); formatCode(); return; }

      // Escape
      if (e.key === 'Escape') {
        hideCommandPalette();
        hideContextMenu();
        toggleFindPanel(false);
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });
  }

  /* ───────────── Toggle Switches ───────────── */
  function initToggleSwitches() {
    document.querySelectorAll('.toggle-switch').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('active');
      });
    });
  }

  /* ───────────── Collapse All ───────────── */
  async function collapseAll() {
    const allFiles = await dbGetAll('files');
    for (const f of allFiles) {
      if (f.type === 'folder' && f.open) {
        f.open = false;
        await dbPut('files', f);
      }
    }
    await loadFileTree();
  }

  /* ───────────── Breadcrumb ───────────── */
  function updateBreadcrumb() {
    if (!state.activeTab || !DOM.breadcrumb) return;
    const parts = state.activeTab.split('/').filter(Boolean);
    DOM.breadcrumb.innerHTML = parts.map((p, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const safePath = feEscapeHtml(path);
      const safeName = feEscapeHtml(p);
      return `<span class="breadcrumb-item ${i === parts.length - 1 ? 'active' : ''}" data-path="${safePath}">${safeName}</span>`;
    }).join('');
  }

  /* ───────────── Event Bindings ───────────── */
  function bindEvents() {
    // Title bar
    DOM.toggleSidebar.addEventListener('click', () => toggleSidebar());
    DOM.btnPreview.addEventListener('click', openPreview);
    DOM.openSettings.addEventListener('click', () => { populateSettings(); openModal(DOM.settingsModal); });
    DOM.openCommandPalette.addEventListener('click', showCommandPalette);
    DOM.newFile.addEventListener('click', openNewFileModal);
    DOM.logoBtn.addEventListener('click', () => {
      if (state.openTabs.length === 0) showWelcome();
    });

    // Sidebar
    DOM.newFolder.addEventListener('click', openNewFolderModal);
    DOM.collapseAll.addEventListener('click', collapseAll);
    DOM.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

    // Toolbar
    DOM.btnUndo.addEventListener('click', () => { const ed = getActiveEditor(); if (ed) ed.undo(); });
    DOM.btnRedo.addEventListener('click', () => { const ed = getActiveEditor(); if (ed) ed.redo(); });
    DOM.btnCut.addEventListener('click', () => {
      const ed = getActiveEditor();
      if (ed) {
        const sel = ed.getSelection();
        if (sel) { navigator.clipboard.writeText(sel); ed.replaceSelection(''); }
      }
    });
    DOM.btnCopy.addEventListener('click', () => {
      const ed = getActiveEditor();
      if (ed) {
        const sel = ed.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
        else {
          const content = ed.getValue();
          navigator.clipboard.writeText(content);
        }
      }
    });
    DOM.btnPaste.addEventListener('click', async () => {
      const ed = getActiveEditor();
      if (ed) {
        try {
          const text = await navigator.clipboard.readText();
          ed.replaceSelection(text);
        } catch (e) {
          showToast('Paste failed - check clipboard permissions', 'warning');
        }
      }
    });
    DOM.btnSave.addEventListener('click', saveCurrentFile);
    DOM.btnFind.addEventListener('click', () => toggleFindPanel(true));
    DOM.btnExport.addEventListener('click', openExportModal);

    // Markdown toolbar
    DOM.btnBold.addEventListener('click', () => insertMarkdown('bold'));
    DOM.btnItalic.addEventListener('click', () => insertMarkdown('italic'));
    DOM.btnHeading.addEventListener('click', () => insertMarkdown('heading'));
    DOM.btnLink.addEventListener('click', () => insertMarkdown('link'));
    DOM.btnImage.addEventListener('click', () => insertMarkdown('image'));
    DOM.btnCode.addEventListener('click', () => insertMarkdown('code'));
    DOM.btnQuote.addEventListener('click', () => insertMarkdown('quote'));
    DOM.btnList.addEventListener('click', () => insertMarkdown('list'));
    DOM.btnTable.addEventListener('click', () => insertMarkdown('table'));

    // View toolbar
    DOM.btnPreview1.addEventListener('click', openPreview);
    DOM.btnSplit.addEventListener('click', () => setMarkdownView('split'));

    // Code toolbar
    DOM.btnFormat.addEventListener('click', formatCode);
    DOM.btnMinify.addEventListener('click', minifyCode);

    // Find & Replace
    DOM.closeFindPanel.addEventListener('click', () => toggleFindPanel(false));
    DOM.findNextBtn.addEventListener('click', () => doFind(1));
    DOM.findPrevBtn.addEventListener('click', () => doFind(-1));
    DOM.replaceBtn.addEventListener('click', doReplace);
    DOM.replaceAllBtn.addEventListener('click', doReplaceAll);
    DOM.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doFind(e.shiftKey ? -1 : 1); }
    });

    // Command palette
    DOM.commandInput.addEventListener('input', (e) => renderCommands(e.target.value));
    DOM.commandInput.addEventListener('keydown', (e) => {
      const items = DOM.commandResults.querySelectorAll('.command-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedCmd = Math.min(selectedCmd + 1, items.length - 1); updateCmdSelection(items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedCmd = Math.max(selectedCmd - 1, 0); updateCmdSelection(items); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const q = DOM.commandInput.value.toLowerCase();
        const filtered = commands.filter(c => c.name.toLowerCase().includes(q));
        executeCommand(filtered, selectedCmd);
      }
    });

    // New File modal
    DOM.createNewFile.addEventListener('click', createNewFileAction);
    DOM.cancelNewFile.addEventListener('click', () => closeModal(DOM.newFileModal));
    DOM.closeNewFileModal.addEventListener('click', () => closeModal(DOM.newFileModal));
    DOM.newFileName.addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFileAction(); });

    // New Folder modal
    DOM.createNewFolder.addEventListener('click', createNewFolderAction);
    DOM.cancelNewFolder.addEventListener('click', () => closeModal(DOM.newFolderModal));
    DOM.closeNewFolderModal.addEventListener('click', () => closeModal(DOM.newFolderModal));
    DOM.newFolderName.addEventListener('keydown', (e) => { if (e.key === 'Enter') createNewFolderAction(); });

    // Rename modal
    DOM.confirmRename.addEventListener('click', confirmRenameAction);
    DOM.cancelRename.addEventListener('click', () => closeModal(DOM.renameModal));
    DOM.closeRenameModal.addEventListener('click', () => closeModal(DOM.renameModal));
    DOM.renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmRenameAction(); });

    // Export modal
    DOM.confirmExport.addEventListener('click', confirmExportAction);
    DOM.cancelExport.addEventListener('click', () => closeModal(DOM.exportModal));
    DOM.closeExportModal.addEventListener('click', () => closeModal(DOM.exportModal));

    // Settings modal
    DOM.closeSettingsModal.addEventListener('click', () => closeModal(DOM.settingsModal));
    DOM.saveSettings.addEventListener('click', async () => {
      collectSettings();
      await applySettings();
      await saveSettingsToDB();
      closeModal(DOM.settingsModal);
      showToast('Settings saved', 'success');
    });
    DOM.resetSettings.addEventListener('click', async () => {
      state.settings = {
        theme: 'dark', editorTheme: 'material-darker', fontSize: 14, lineHeight: 1.6,
        lineNumbers: true, activeLine: true, matchBrackets: true, autoCloseBrackets: true,
        wordWrap: true, showWhitespace: false, scrollPastEnd: true,
        keyMap: 'default', tabSize: 2, insertSpaces: true, autoSave: true, autoFold: false,
      };
      populateSettings();
      await applySettings();
      await saveSettingsToDB();
      showToast('Settings reset to defaults', 'info');
    });
    DOM.settingFontSize.addEventListener('input', () => { DOM.fontSizeValue.textContent = DOM.settingFontSize.value; });
    DOM.settingLineHeight.addEventListener('input', () => { DOM.lineHeightValue.textContent = DOM.settingLineHeight.value; });
    DOM.exportAllData.addEventListener('click', exportAllDataAction);
    DOM.importDataBtn.addEventListener('click', importDataAction);
    DOM.clearAllData.addEventListener('click', clearAllDataAction);
    DOM.importInput.addEventListener('change', handleImportFile);

    // Shortcuts modal
    DOM.closeShortcutsModal.addEventListener('click', () => closeModal(DOM.shortcutsModal));
    DOM.closeShortcutsBtn.addEventListener('click', () => closeModal(DOM.shortcutsModal));

    // Snippets modal
    DOM.closeSnippetsModal.addEventListener('click', () => closeModal(DOM.snippetsModal));
    DOM.closeSnippetsBtn.addEventListener('click', () => closeModal(DOM.snippetsModal));

    // Welcome screen
    DOM.welcomeNewFile.addEventListener('click', openNewFileModal);
    DOM.welcomeOpenFile.addEventListener('click', () => DOM.fileInput.click());
    DOM.welcomeOpenFolder.addEventListener('click', () => DOM.folderInput.click());
    DOM.clearAllRecent.addEventListener('click', async () => {
      state.recentFiles = [];
      await saveRecentFiles();
      loadRecentFiles();
    });

    // File inputs
    DOM.fileInput.addEventListener('change', handleFileInput);
    DOM.folderInput.addEventListener('change', handleFolderInput);

    // Global click handlers
    document.addEventListener('click', (e) => {
      // Close context menu on outside click
      if (!e.target.closest('.context-menu')) hideContextMenu();
      // Close command palette on outside click
      if (!e.target.closest('.command-palette') && !e.target.closest('#openCommandPalette')) {
        DOM.commandPalette.classList.remove('active');
      }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // Window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768) {
        DOM.sidebarOverlay.style.display = 'none';
        DOM.sidebarOverlay.classList.remove('active');
      }
      // Refresh active editor
      const ed = getActiveEditor();
      if (ed) setTimeout(() => ed.refresh(), 100);
    });

    // Before unload - warn about unsaved changes
    window.addEventListener('beforeunload', (e) => {
      const hasModified = state.openTabs.some(t => t.modified);
      if (hasModified) {
        e.preventDefault();
        e.returnValue = '';
      }
      // Auto-save before leaving
      if (state.settings.autoSave) autoSaveAll();
    });

    // Online/offline status
    window.addEventListener('online', () => {
      DOM.statusText.textContent = 'Ready';
      DOM.statusDot.style.background = '';
      showToast('Back online', 'success');
    });
    window.addEventListener('offline', () => {
      DOM.statusText.textContent = 'Offline';
      DOM.statusDot.style.background = 'var(--warning)';
      showToast('You are offline — changes are saved locally', 'warning');
    });
  }

  function updateCmdSelection(items) {
    items.forEach((item, i) => item.classList.toggle('selected', i === selectedCmd));
    if (items[selectedCmd]) items[selectedCmd].scrollIntoView({ block: 'nearest' });
  }

  /* ───────────── Markdown Toolbar Events ───────────── */
  function initMarkdownToolbar() {
    DOM.markdownToolbar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => insertMarkdown(btn.dataset.action));
    });
  }

  /* ───────────── Auto Save Timer ───────────── */
  function startAutoSave() {
    if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
    if (state.settings.autoSave) {
      state.autoSaveTimer = setInterval(autoSaveAll, 10000);
    }
  }

  /* ───────────── Service Worker Registration ───────────── */
function registerSW() {
  if ('serviceWorker' in navigator) {
    // Hitung base path dari lokasi halaman saat ini
    const currentPath = location.pathname;
    const basePath = currentPath.endsWith('/') ? currentPath : currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const swUrl = basePath + 'sw.js';
    const swScope = basePath;

    console.log('[ForgeEdit PWA] Current path:', currentPath);
    console.log('[ForgeEdit PWA] SW URL:', swUrl);
    console.log('[ForgeEdit PWA] SW Scope:', swScope);

    // Flag untuk mencegah infinite reload loop
    let refreshing = false;

    navigator.serviceWorker.register(swUrl, { scope: swScope }).then((reg) => {
      console.log('[ForgeEdit PWA] Service Worker registered:', reg.scope);
      console.log('[ForgeEdit PWA] SW active:', !!reg.active);
      console.log('[ForgeEdit PWA] SW installing:', !!reg.installing);
      console.log('[ForgeEdit PWA] SW waiting:', !!reg.waiting);

      if (!navigator.serviceWorker.controller) {
        console.warn('[ForgeEdit PWA] ⚠️ SW terdaftar tapi BELUM controlling page ini.');
        console.warn('[ForgeEdit PWA] Ini NORMAL pada kunjungan pertama.');
      } else {
        console.log('[ForgeEdit PWA] ✅ SW is controlling this page');
      }

      // Check for updates periodically (every 60 minutes)
      setInterval(() => {
        reg.update().catch(() => {});
      }, 3600000);

      // Listen for controller change dengan pengaman flag
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return; // Jika sedang proses refresh, abaikan
        refreshing = true;
        console.log('[ForgeEdit PWA] ✅ SW controller changed! Page will reload...');
        location.reload();
      });

      // Listen for update
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          console.log('[ForgeEdit PWA] New worker state:', newWorker.state);
          // Pastikan navigator.serviceWorker.controller ada, artinya ini adalah UPDATE, bukan instalasi pertama
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Cek apakah fungsi showToast tersedia sebelum dipanggil
            if (typeof showToast === 'function') {
              showToast('Update available! Close and reopen to update.', 'info', 8000);
            } else {
              console.log('[ForgeEdit PWA] Update available! Silakan muat ulang halaman.');
            }
          }
        });
      });
    }).catch((err) => {
      console.warn('[ForgeEdit PWA] SW registration failed:', err);
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('[ForgeEdit PWA] PWA requires HTTPS. Current protocol:', location.protocol);
      }
    });
  } else {
    console.warn('[ForgeEdit PWA] Service Worker not supported in this browser');
  }
}
   
/* ───────────── PWA Install Prompt (manifest inline) ───────────── */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    const installBanner = document.getElementById('install-banner');
    const installBtn = document.getElementById('install-btn');
    
    if (installBanner) installBanner.classList.remove('hidden');
    if (installBtn) installBtn.classList.remove('hidden');
    
    console.log('📲 PWA install prompt siap ditampilkan');
});

async function installApp() {
    if (!deferredPrompt) {
        showToast('Aplikasi sudah terinstal atau browser tidak mendukung', 'info');
        return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    if (outcome === 'accepted') {
        showToast('🎉 Aplikasi berhasil diinstal!', 'success');
    } else {
        showToast('Instalasi dibatalkan', 'info');
    }
    
    deferredPrompt = null;
    
    const installBanner = document.getElementById('install-banner');
    const installBtn = document.getElementById('install-btn');
    if (installBanner) installBanner.classList.add('hidden');
    if (installBtn) installBtn.classList.add('hidden');
}

function closeInstallBanner() {
    const installBanner = document.getElementById('install-banner');
    if (installBanner) installBanner.classList.add('hidden');
}

// Deteksi ketika sudah terinstal
window.addEventListener('appinstalled', () => {
    console.log('✅ PWA berhasil diinstal');
    deferredPrompt = null;
    
    const installBanner = document.getElementById('install-banner');
    const installBtn = document.getElementById('install-btn');
    if (installBanner) installBanner.classList.add('hidden');
    if (installBtn) installBtn.classList.add('hidden');
    
    showToast('Aplikasi sudah terinstal di perangkat Anda', 'success');
});

// Event listener untuk tombol install
function bindInstallEvents() {
    const installBtn = document.getElementById('install-btn');
    const installBannerClose = document.getElementById('install-banner-close');
    
    if (installBtn) {
        installBtn.addEventListener('click', installApp);
    }
    if (installBannerClose) {
        installBannerClose.addEventListener('click', closeInstallBanner);
    }
}

const PREVIEW_IFRAME_ID = 'forgeedit-preview-iframe-overlay';

function getWorkspaceRootFromPath(path) {
  const p = String(path || '').replace(/^\/+/, '').trim();
  if (!p) return '/';
  const parts = p.split('/');
  return parts.length > 1 ? parts[0] : '/';
}

function buildPreviewUrl() {
  const activePath = state.activeTab;
  const url = new URL('preview.html', location.href);

  if (activePath) {
    const cleanPath = String(activePath).replace(/^\/+/, '');
    const root = getWorkspaceRootFromPath(cleanPath);
    if (root && root !== '/') url.searchParams.set('root', root);
    url.searchParams.set('file', cleanPath);
  }

  return url.toString();
}

function ensurePreviewOverlay() {
  let overlay = document.getElementById(PREVIEW_IFRAME_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = PREVIEW_IFRAME_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0,0,0,.55);
    display: none;
  `;

  overlay.innerHTML = `
    <div style="position:absolute;inset:0;background:var(--bg, #0f1115);">
      <button id="forgeedit-preview-close"
        style="
          position:absolute;
          top:12px;
          right:12px;
          z-index:2;
          width:40px;
          height:40px;
          border:0;
          border-radius:12px;
          background:rgba(0,0,0,.55);
          color:#fff;
          font-size:20px;
          cursor:pointer;
        ">×</button>

      <iframe
        id="forgeedit-preview-frame"
        sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin"
        style="width:100%;height:100%;border:0;background:#fff;"
      ></iframe>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#forgeedit-preview-close').addEventListener('click', closePreview);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });

  return overlay;
}

// Attach ke semua tombol dengan class toggle-preview
document.querySelectorAll('.toggle-preview').forEach(btn => {
  btn.addEventListener('click', openPreview);
});

function openPreview() {
  const overlay = ensurePreviewOverlay();
  const frame = overlay.querySelector('#forgeedit-preview-frame');

  frame.src = buildPreviewUrl();
  overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const overlay = document.getElementById(PREVIEW_IFRAME_ID);
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}
   
  /* ───────────── Initialize ───────────── */
  async function init() {
    cacheDom();
    await openDB();
    await loadSettings();
    applyTheme();
    bindEvents();
    initToggleSwitches();
    initKeyboard();
    initDragDrop();
    initSplitResize();
    initSidebarSearch();
    initMarkdownToolbar();
    await loadFileTree();
    loadRecentFiles();
    showWelcome();
    updateStatusBar();
    registerSW();
    startAutoSave();
    DOM.statusText.textContent = 'Ready';

    // Apply font size to existing editors on init
    document.querySelectorAll('.CodeMirror').forEach(cm => {
      cm.style.fontSize = state.settings.fontSize + 'px';
      cm.style.lineHeight = String(state.settings.lineHeight);
    });

    initGitMoireBridge();
    bindInstallEvents();
    
    // Handle URL action parameters from PWA shortcuts
    handleUrlActions();
    
    console.log('[ForgeEdit Pro] Initialized');
  }
  
  /* ───────────── URL Action Handler ───────────── */
  function handleUrlActions() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    
    if (!action) return;
    
    // Delay execution to ensure UI is ready
    setTimeout(() => {
      switch(action) {
        case 'newfile':
          if (typeof openNewFileModal === 'function') {
            openNewFileModal();
          }
          break;
        case 'openfile':
          // Trigger file import dialog
          const fileInput = document.getElementById('importFileInput');
          if (fileInput) {
            fileInput.click();
          }
          break;
        case 'settings':
          if (typeof populateSettings === 'function' && typeof openModal === 'function') {
            populateSettings();
            openModal(DOM.settingsModal);
          }
          break;
      }
      
      // Clean up URL without reloading
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 500);
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
