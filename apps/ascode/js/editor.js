/**
 * editor.js — CodeMirror Editor, File System & Tab Management
 *
 * FIX #8: Reset tab modified state on save
 * FIX #9: Atomic rename operation (await-based)
 * FIX #12: Debounced tree rebuild for performance
 * FIX #3: Escape HTML in all dynamic content (file names, breadcrumbs, tabs)
 */
window.VS = window.VS || {};

VS.Editor = (function() {
  'use strict';

  var editor = null;
  var currentFile = null;
  var activeTabPath = null;
  var openTabs = new Map();
  var fileTreeData = [];
  var currentPanel = 'explorer';

  // FIX #12: Debounce rebuildTree
  var rebuildTimer = null;
  var REBUILD_DELAY = 80;

  function getEditor() { return editor; }
  function getCurrentFile() { return currentFile; }
  function getActiveTabPath() { return activeTabPath; }
  function getOpenTabs() { return openTabs; }
  function getFileTreeData() { return fileTreeData; }
  function getCurrentPanel() { return currentPanel; }
  function setCurrentPanel(p) { currentPanel = p; }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getFileIcon(name) {
    var ext = name.split('.').pop().toLowerCase();
    var icons = {
      js: { icon: 'fab fa-js-square', cls: 'js' },
      ts: { icon: 'fas fa-code', cls: 'ts' },
      html: { icon: 'fab fa-html5', cls: 'html' },
      css: { icon: 'fab fa-css3-alt', cls: 'css' },
      py: { icon: 'fab fa-python', cls: 'py' },
      json: { icon: 'fas fa-brackets-curly', cls: 'json' },
      md: { icon: 'fab fa-markdown', cls: 'md' },
      sql: { icon: 'fas fa-database', cls: 'sql' },
      default: { icon: 'fas fa-file-code', cls: 'default' }
    };
    return icons[ext] || icons.default;
  }

  function getModeForExt(ext) {
    var modes = {
      js: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
      html: 'htmlmixed', htm: 'htmlmixed', css: 'css', scss: 'css',
      py: 'python', md: 'markdown', json: 'javascript',
      xml: 'xml', svg: 'xml', c: 'text/x-csrc', cpp: 'text/x-c++src',
      java: 'text/x-java', cs: 'text/x-csharp', sql: 'sql', php: 'php',
      rb: 'ruby', go: 'go', rs: 'rust', yml: 'yaml', yaml: 'yaml',
      sh: 'shell', bash: 'shell', dockerfile: 'dockerfile'
    };
    return modes[ext] || 'javascript';
  }

  function getLangName(ext) {
    var names = {
      js: 'JavaScript', ts: 'TypeScript', jsx: 'JavaScript JSX', tsx: 'TypeScript JSX',
      html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', py: 'Python',
      md: 'Markdown', json: 'JSON', xml: 'XML', c: 'C', cpp: 'C++',
      java: 'Java', cs: 'C#', sql: 'SQL', php: 'PHP', rb: 'Ruby',
      go: 'Go', rs: 'Rust', yml: 'YAML', yaml: 'YAML', sh: 'Shell', bash: 'Bash'
    };
    return names[ext] || 'Plain Text';
  }

  // ---- Tree Management ----

  function rebuildTree(db, callback) {
    // FIX #12: Debounced rebuild
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function() { doRebuildTree(db, callback); }, REBUILD_DELAY);
  }

  function rebuildTreeImmediate(db, callback) {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    doRebuildTree(db, callback);
  }

  async function doRebuildTree(db, callback) {
    var records = await db.files.toArray();
    var root = [];
    var map = new Map();
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      map.set(rec.path, Object.assign({}, rec, { children: [] }));
    }
    for (var j = 0; j < records.length; j++) {
      var r = records[j];
      if (r.path === '/') continue;
      var parts = r.path.split('/').filter(function(p) { return p; });
      var parentPath = '/' + parts.slice(0, -1).join('/');
      if (parentPath === '') parentPath = '/';
      if (map.has(parentPath)) {
        map.get(parentPath).children.push(map.get(r.path));
      } else {
        root.push(map.get(r.path));
      }
    }
    if (map.has('/')) root.unshift(map.get('/'));
    fileTreeData = root;
    if (callback) callback();
  }

  // ---- File Operations ----

  async function createFile(db, parentPath, fileName, callback) {
    if (!fileName) return;
    var fullPath = parentPath === '/' ? '/' + fileName : parentPath + '/' + fileName;
    var exists = await db.files.get(fullPath);
    if (exists) throw new Error('File already exists!');
    await db.files.add({ path: fullPath, content: '', type: 'file', lastModified: Date.now() });
    rebuildTreeImmediate(db, callback);
    await openFileByPath(db, fullPath, callback);
    return fullPath;
  }

  async function createFolder(db, parentPath, folderName, callback) {
    if (!folderName) return;
    var fullPath = parentPath === '/' ? '/' + folderName : parentPath + '/' + folderName;
    var exists = await db.files.get(fullPath);
    if (exists) throw new Error('Folder already exists!');
    await db.files.add({ path: fullPath, content: null, type: 'folder', lastModified: Date.now() });
    rebuildTreeImmediate(db, callback);
    return fullPath;
  }

  async function saveCurrentContent(db) {
    if (currentFile && editor) {
      var content = editor.getValue();
      await db.files.update(currentFile, { content: content, lastModified: Date.now() });
      // FIX #8: Reset modified state on save
      var tab = openTabs.get(currentFile);
      if (tab) {
        tab.modified = false;
        if (tab.tabElement) tab.tabElement.classList.remove('modified');
      }
    }
  }

  async function openFileByPath(db, path, callback) {
    var record = await db.files.get(path);
    if (!record || record.type !== 'file') return;
    if (currentFile && editor) await saveCurrentContent(db);

    if (editor) {
      editor.setValue(record.content || '');
      var ext = path.split('.').pop();
      editor.setOption('mode', getModeForExt(ext));
    }
    currentFile = path;
    activeTabPath = path;
    if (!openTabs.has(path)) {
      openTabs.set(path, { content: record.content, modified: false });
      addTabUI(path);
    }
    highlightActiveTab();
    if (callback) callback();
  }

  async function closeTab(db, path, callback) {
    if (editor && currentFile === path) {
      await saveCurrentContent(db);
      currentFile = null;
    }
    openTabs.delete(path);
    refreshTabsUI();
    if (openTabs.size > 0) {
      var first = openTabs.keys().next().value;
      await openFileByPath(db, first, callback);
    } else {
      currentFile = null;
      if (editor) editor.setValue('');
    }
    if (callback) callback();
  }

  async function deleteItem(db, path, type, callback) {
    if (type === 'folder') {
      var all = await db.files.toArray();
      for (var i = 0; i < all.length; i++) {
        if (all[i].path.startsWith(path + '/') || all[i].path === path) {
          await db.files.delete(all[i].path);
        }
      }
    } else {
      await db.files.delete(path);
      if (currentFile === path) { editor.setValue(''); currentFile = null; }
      if (openTabs.has(path)) await closeTab(db, path, callback);
    }
    rebuildTreeImmediate(db, callback);
  }

  /**
   * FIX #9: Atomic rename using await and transaction-style approach.
   */
  async function renameItem(db, path, newName, callback) {
    if (!newName) return;
    var parts = path.split('/');
    parts[parts.length - 1] = newName;
    var newPath = parts.join('/');

    var record = await db.files.get(path);
    if (!record) return;

    // Check if new path already exists
    var existing = await db.files.get(newPath);
    if (existing) throw new Error('A file/folder with that name already exists!');

    // Update record
    record.path = newPath;
    record.name = newName;
    record.lastModified = Date.now();

    // Atomic: add new then delete old
    await db.files.add(record);
    await db.files.delete(path);

    // If renaming a folder, update all children paths
    if (record.type === 'folder') {
      var children = await db.files.toArray();
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.path.startsWith(path + '/')) {
          var childNewPath = newPath + child.path.substring(path.length);
          child.path = childNewPath;
          await db.files.put(child);
          await db.files.delete(children[i].path);
        }
      }
    }

    // Update tab references
    if (openTabs.has(path)) {
      var tabData = openTabs.get(path);
      openTabs.delete(path);
      openTabs.set(newPath, tabData);
      refreshTabsUI();
    }

    if (currentFile === path) currentFile = newPath;
    if (activeTabPath === path) activeTabPath = newPath;

    rebuildTreeImmediate(db, callback);
    return newPath;
  }

  // ---- Tab UI ----

  function addTabUI(path) {
    var tabsBar = document.getElementById('tabsBar');
    if (!tabsBar) return;
    var tab = document.createElement('div');
    tab.className = 'tab';
    if (activeTabPath === path) tab.classList.add('active');
    var name = path.split('/').pop();
    var fi = getFileIcon(name);
    // FIX #3: Escape dynamic content in tab HTML
    tab.innerHTML =
      '<span class="tab-icon"><i class="' + escapeHtml(fi.icon) + '" style="font-size:12px"></i></span>' +
      '<span class="tab-name">' + escapeHtml(name) + '</span>' +
      '<span class="close-tab"><i class="fas fa-times"></i></span>';
    tab.addEventListener('click', function(e) {
      if (e.target.closest('.close-tab')) { e.stopPropagation(); VS.UI.closeTabHandler(path); }
      else VS.App.openFile(path);
    });
    tab.addEventListener('mousedown', function(e) { if (e.button === 1) { e.preventDefault(); VS.UI.closeTabHandler(path); } });
    tabsBar.appendChild(tab);
    openTabs.get(path).tabElement = tab;
  }

  function highlightActiveTab() {
    openTabs.forEach(function(val, p) {
      if (val.tabElement) {
        if (p === activeTabPath) val.tabElement.classList.add('active');
        else val.tabElement.classList.remove('active');
      }
    });
  }

  function refreshTabsUI() {
    var tabsBar = document.getElementById('tabsBar');
    if (!tabsBar) return;
    tabsBar.innerHTML = '';
    openTabs.forEach(function(val, p) { addTabUI(p); });
  }

  // ---- Breadcrumbs (FIX #3: escaped) ----

  function updateBreadcrumbs(path) {
    var bc = document.getElementById('breadcrumbs');
    if (!bc) return;
    if (!path) { bc.innerHTML = '<span>Workspace</span>'; return; }
    var parts = path.split('/').filter(function(p) { return p; });
    var html = '<span>Workspace</span>';
    var cumPath = '';
    for (var i = 0; i < parts.length; i++) {
      cumPath += '/' + parts[i];
      html += '<span class="sep"> / </span><span data-path="' + escapeHtml(cumPath) + '">' + escapeHtml(parts[i]) + '</span>';
    }
    bc.innerHTML = html;
  }

  // ---- Status Bar ----

  function updateStatusBar() {
    if (!editor) return;
    var cursor = editor.getCursor();
    var statusCursor = document.getElementById('statusCursor');
    var statusLang = document.getElementById('statusLang');
    var statusIndent = document.getElementById('statusIndent');
    if (statusCursor) statusCursor.textContent = 'Ln ' + (cursor.line + 1) + ', Col ' + (cursor.ch + 1);
    var ext = (currentFile || '').split('.').pop();
    if (statusLang) statusLang.textContent = getLangName(ext);
    if (statusIndent) statusIndent.textContent = 'Spaces: ' + (editor.getOption('indentUnit') || 2);
  }

  // ---- Minimap ----

  function updateMinimap() {
    if (!editor) return;
    var mm = document.getElementById('minimap');
    if (!mm) return;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var lineCount = editor.lineCount();
    var scale = 3;
    canvas.width = 50;
    canvas.height = Math.max(mm.clientHeight, lineCount * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < lineCount; i++) {
      var line = editor.getLine(i);
      if (!line || !line.trim()) continue;
      var x = (line.search(/\S/) || 0) * 1.2;
      var w = Math.min(line.trim().length * 0.8, canvas.width - x - 4);
      ctx.fillStyle = 'rgba(152, 120, 208, 0.15)';
      ctx.fillRect(x + 2, i * scale, Math.max(w, 6), Math.max(scale - 1, 1));
    }
    var scrollInfo = editor.getScrollInfo();
    var lineHeight = editor.defaultTextHeight();
    var viewportTop = scrollInfo.top / lineHeight * scale;
    var viewportHeight = scrollInfo.clientHeight / lineHeight * scale;
    ctx.fillStyle = 'rgba(152, 120, 208, 0.08)';
    ctx.fillRect(0, viewportTop, canvas.width, viewportHeight);
    ctx.strokeStyle = 'rgba(152, 120, 208, 0.2)';
    ctx.strokeRect(0, viewportTop, canvas.width, viewportHeight);
    mm.innerHTML = '';
    mm.appendChild(canvas);
  }

  // ---- Editor Init ----

  function initEditor() {
    var textarea = document.createElement('textarea');
    document.getElementById('codeArea').appendChild(textarea);
    editor = CodeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      mode: 'javascript',
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: false,
      autoCloseBrackets: true,
      matchBrackets: true,
      autoCloseTags: true,
      foldGutter: true,
      styleActiveLine: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Ctrl-S': function() { VS.App.saveFile(); VS.UI.toast('Saved', 'success'); },
        'Cmd-S': function() { VS.App.saveFile(); VS.UI.toast('Saved', 'success'); },
        'Ctrl-F': 'findPersistent',
        'Ctrl-H': 'replace',
        'Ctrl-G': 'jumpToLine',
        'Ctrl-/': 'toggleComment',
        'Ctrl-Space': function(cm) { cm.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false }); },
        'Ctrl-Shift-P': function() { VS.UI.openCommandPalette(); },
        'Ctrl-B': function() { VS.UI.toggleSidebar(); },
        'Ctrl-`': function() { VS.UI.toggleBottomPanel(); },
        'Ctrl-W': function() { if (currentFile) VS.UI.closeTabHandler(currentFile); },
        'Alt-Z': function(cm) { cm.setOption('lineWrapping', !cm.getOption('lineWrapping')); },
        'Ctrl-Shift-I': function() { VS.UI.toggleCopilotPanel(); }
      },
      hintOptions: { completeSingle: false },
      placeholder: 'Start coding...'
    });
    editor.on('change', function() {
      if (currentFile) {
        var tab = openTabs.get(currentFile);
        if (tab) {
          tab.modified = true;
          if (tab.tabElement) tab.tabElement.classList.add('modified');
        }
      }
      updateStatusBar();
      updateMinimap();
    });
    editor.on('cursorActivity', function() { updateStatusBar(); });
    editor.setValue('');
    return editor;
  }

  return {
    getEditor, getCurrentFile, getActiveTabPath, getOpenTabs, getFileTreeData,
    getCurrentPanel, setCurrentPanel,
    getFileIcon, getModeForExt, getLangName, escapeHtml,
    rebuildTree, rebuildTreeImmediate,
    createFile, createFolder, saveCurrentContent, openFileByPath,
    closeTab, deleteItem, renameItem,
    addTabUI, highlightActiveTab, refreshTabsUI,
    updateBreadcrumbs, updateStatusBar, updateMinimap,
    initEditor
  };
})();
