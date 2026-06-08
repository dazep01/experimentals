/**
 * app.js — Main Application Controller
 *
 * Orchestrates all modules: Crypto, Sandbox, Copilot, Tools, Editor, UI
 * Handles: initialization, event binding, GitHub integration, file dialogs
 */
window.VS = window.VS || {};

VS.App = (function() {
  'use strict';

  var db = new Dexie('VSCodePastelDB');
  db.version(1).stores({ files: 'path, content, type, lastModified' });

  var selectedContext = new Set();

  // ---- File Dialogs ----

  function showNewFileDialog(parentPath) {
    VS.UI.showModal(
      '<i class="fas fa-file-medical" style="color:var(--accent-mint)"></i> New File',
      '<label style="font-size:12px;color:var(--text-muted);margin-bottom:4px;display:block">File name</label>' +
      '<input type="text" id="newFileName" placeholder="e.g. script.js" autofocus>',
      function() {
        var name = document.getElementById('newFileName').value.trim();
        if (name) {
          var parent = parentPath || (VS.Editor.getCurrentFile()
            ? VS.Editor.getCurrentFile().split('/').slice(0, -1).join('/') || '/'
            : '/');
          VS.Editor.createFile(db, parent, name, function() { VS.UI.renderSidebar(); })
            .then(function() { VS.UI.toast('File created: ' + name, 'success'); })
            .catch(function(e) { VS.UI.toast(e.message, 'error'); });
          VS.UI.closeModal();
        }
      }
    );
    setTimeout(function() { document.getElementById('newFileName')?.focus(); }, 100);
  }

  function showNewFolderDialog(parentPath) {
    VS.UI.showModal(
      '<i class="fas fa-folder-plus" style="color:var(--accent-peach)"></i> New Folder',
      '<label style="font-size:12px;color:var(--text-muted);margin-bottom:4px;display:block">Folder name</label>' +
      '<input type="text" id="newFolderName" placeholder="e.g. components" autofocus>',
      function() {
        var name = document.getElementById('newFolderName').value.trim();
        if (name) {
          var parent = parentPath || (VS.Editor.getCurrentFile()
            ? VS.Editor.getCurrentFile().split('/').slice(0, -1).join('/') || '/'
            : '/');
          VS.Editor.createFolder(db, parent, name, function() { VS.UI.renderSidebar(); })
            .then(function() { VS.UI.toast('Folder created: ' + name, 'success'); })
            .catch(function(e) { VS.UI.toast(e.message, 'error'); });
          VS.UI.closeModal();
        }
      }
    );
    setTimeout(function() { document.getElementById('newFolderName')?.focus(); }, 100);
  }

  function showGitHubModal() {
    VS.UI.showModal(
      '<i class="fab fa-github" style="color:var(--text-primary)"></i> Connect GitHub',
      '<label style="font-size:12px;color:var(--text-muted);margin-bottom:4px;display:block">Personal Access Token</label>' +
      '<input type="password" id="ghTokenInput" placeholder="ghp_xxxxxxxxxxxx">' +
      '<p style="font-size:11px;color:var(--text-muted);margin-top:4px">Requires repo scope. Token is encrypted and stored locally.</p>',
      async function() {
        var token = document.getElementById('ghTokenInput').value.trim();
        if (token) {
          await VS.Crypto.saveGitHubToken(token);
          VS.UI.toast('GitHub token saved securely', 'success');
          VS.UI.closeModal();
        }
      }
    );
  }

  function showSettingsModal() {
    var ed = VS.Editor.getEditor();
    VS.UI.showModal(
      '<i class="fas fa-cog" style="color:var(--accent-lavender)"></i> Settings',
      '<div style="margin-bottom:12px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Font Size</label>' +
        '<input type="range" id="settingsFontSize" min="10" max="22" value="' + (ed ? ed.getOption('fontSize') : 13) + '" style="width:100%">' +
        '<span id="fontSizeLabel" style="font-size:12px;color:var(--text-secondary)">' + (ed ? ed.getOption('fontSize') : 13) + 'px</span>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Tab Size</label>' +
        '<select id="settingsTabSize">' +
          '<option value="2" ' + (ed?.getOption('indentUnit') === 2 ? 'selected' : '') + '>2 spaces</option>' +
          '<option value="4" ' + (ed?.getOption('indentUnit') === 4 ? 'selected' : '') + '>4 spaces</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Word Wrap</label>' +
        '<select id="settingsWrap">' +
          '<option value="true" ' + (ed?.getOption('lineWrapping') ? 'selected' : '') + '>On</option>' +
          '<option value="false" ' + (!ed?.getOption('lineWrapping') ? 'selected' : '') + '>Off</option>' +
        '</select>' +
      '</div>',
      function() {
        if (ed) {
          ed.setOption('fontSize', parseInt(document.getElementById('settingsFontSize').value));
          ed.setOption('indentUnit', parseInt(document.getElementById('settingsTabSize').value));
          ed.setOption('lineWrapping', document.getElementById('settingsWrap').value === 'true');
        }
        VS.Editor.updateStatusBar();
        VS.UI.closeModal();
      }
    );
    document.getElementById('settingsFontSize')?.addEventListener('input', function(e) {
      document.getElementById('fontSizeLabel').textContent = e.target.value + 'px';
    });
  }

  // ---- Tool Execution ----

  function executeTool(toolId) {
    var editor = VS.Editor.getEditor();
    if (!editor) return;
    try {
      var msg;
      switch (toolId) {
        case 'beautify': msg = VS.Tools.beautify(editor, VS.Editor.getCurrentFile()); break;
        case 'minify': msg = VS.Tools.minify(editor); break;
        case 'json-format': msg = VS.Tools.jsonFormat(editor); break;
        case 'lorem': msg = VS.Tools.loremIpsum(editor); break;
        case 'timestamp': msg = VS.Tools.timestamp(editor); break;
        case 'uuid': msg = VS.Tools.uuid(editor); break;
        case 'template': showTemplateModal(); return;
        case 'base64': showBase64Modal(); return;
        case 'regex': showRegexModal(); return;
        case 'color': showColorModal(); return;
        case 'diff': showDiffModal(); return;
        case 'hash': showHashModal(); return;
        default: return;
      }
      if (msg) VS.UI.toast(msg, 'success');
    } catch (e) {
      VS.UI.toast(e.message, 'error');
    }
  }

  function showTemplateModal() {
    var templates = VS.Tools.getTemplates();
    var options = Object.keys(templates).map(function(k) {
      return '<option value="' + VS.UI.escapeHtml(k) + '">' + VS.UI.escapeHtml(k) + '</option>';
    }).join('');
    VS.UI.showModal('Code Templates',
      '<select id="templateSelect" style="margin-bottom:10px">' + options + '</select>',
      function() {
        var sel = document.getElementById('templateSelect').value;
        var editor = VS.Editor.getEditor();
        if (editor) editor.setValue(templates[sel]);
        VS.UI.toast('Template applied', 'success');
        VS.UI.closeModal();
      }
    );
  }

  function showBase64Modal() {
    var editor = VS.Editor.getEditor();
    var target = editor ? (editor.getSelection() || editor.getValue()) : '';
    VS.UI.showModal('Base64 Encode / Decode',
      '<textarea id="b64Input" rows="5" style="font-family:monospace;font-size:12px">' + VS.Tools.escapeHtml(target) + '</textarea>' +
      '<div style="display:flex;gap:6px;margin-top:4px">' +
        '<button class="btn btn-primary" id="b64Encode" style="flex:1">Encode</button>' +
        '<button class="btn btn-secondary" id="b64Decode" style="flex:1">Decode</button>' +
      '</div>' +
      '<textarea id="b64Output" rows="5" readonly style="font-family:monospace;font-size:12px;margin-top:8px" placeholder="Result..."></textarea>',
      null, true
    );
    document.getElementById('b64Encode').addEventListener('click', function() {
      document.getElementById('b64Output').value = VS.Tools.utf8ToBase64(document.getElementById('b64Input').value);
    });
    document.getElementById('b64Decode').addEventListener('click', function() {
      try { document.getElementById('b64Output').value = VS.Tools.base64ToUtf8(document.getElementById('b64Input').value); }
      catch (e) { document.getElementById('b64Output').value = 'Error: Invalid Base64'; }
    });
  }

  function showRegexModal() {
    VS.UI.showModal('Regex Tester',
      '<input type="text" id="regexPattern" placeholder="Regex pattern (e.g. /\\d+/g)">' +
      '<input type="text" id="regexFlags" placeholder="Flags (e.g. gi)" value="g">' +
      '<textarea id="regexTestStr" rows="4" placeholder="Test string..."></textarea>' +
      '<div id="regexResult" style="margin-top:8px;font-family:monospace;font-size:12px;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm);min-height:40px;color:var(--text-secondary)">Results will appear here...</div>',
      null, true
    );
    var testRegex = function() {
      var pattern = document.getElementById('regexPattern').value;
      var flags = document.getElementById('regexFlags').value;
      var str = document.getElementById('regexTestStr').value;
      var result = document.getElementById('regexResult');
      // FIX #6: Use safe regex tester
      var outcome = VS.Tools.testRegexSafely(pattern, flags, str);
      if (!outcome.success) {
        result.innerHTML = '<span style="color:var(--accent-rose)">Error: ' + VS.Tools.escapeHtml(outcome.error) + '</span>';
        return;
      }
      if (outcome.matches.length === 0) {
        result.innerHTML = '<span style="color:var(--accent-peach)">No matches found</span>';
        return;
      }
      result.innerHTML = outcome.matches.map(function(m, i) {
        return '<div style="margin-bottom:4px"><span style="color:var(--accent-mint)">Match ' + (i + 1) + ':</span> <span style="color:var(--accent-grape)">"' + VS.Tools.escapeHtml(m[0]) + '"</span> at index ' + m.index + '</div>';
      }).join('');
    };
    ['regexPattern', 'regexFlags', 'regexTestStr'].forEach(function(id) {
      document.getElementById(id).addEventListener('input', testRegex);
    });
  }

  function showColorModal() {
    VS.UI.showModal('Color Picker',
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
        '<input type="color" id="colorPicker" value="#9878d0" style="width:60px;height:40px;border:none;cursor:pointer;border-radius:var(--radius-sm)">' +
        '<input type="text" id="colorHex" value="#9878d0" style="flex:1;font-family:monospace">' +
      '</div>' +
      '<div id="colorInfo" style="font-family:monospace;font-size:12px;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm)"></div>',
      null, true
    );
    var updateColor = function(hex) {
      document.getElementById('colorPicker').value = hex;
      document.getElementById('colorHex').value = hex;
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      document.getElementById('colorInfo').textContent = 'HEX: ' + hex + ' | RGB: rgb(' + r + ', ' + g + ', ' + b + ') | HSL: ' + VS.Tools.rgbToHsl(r, g, b);
    };
    document.getElementById('colorPicker').addEventListener('input', function(e) { updateColor(e.target.value); });
    document.getElementById('colorHex').addEventListener('input', function(e) { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateColor(e.target.value); });
    updateColor('#9878d0');
  }

  function showDiffModal() {
    VS.UI.showModal('Diff Viewer',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label style="font-size:11px;color:var(--text-muted)">Original</label><textarea id="diffA" rows="6" style="font-family:monospace;font-size:12px"></textarea></div>' +
        '<div><label style="font-size:11px;color:var(--text-muted)">Modified</label><textarea id="diffB" rows="6" style="font-family:monospace;font-size:12px"></textarea></div>' +
      '</div>' +
      '<div id="diffResult" style="margin-top:8px;font-family:monospace;font-size:12px;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm);max-height:200px;overflow-y:auto"></div>',
      function() {
        var a = document.getElementById('diffA').value.split('\n');
        var b = document.getElementById('diffB').value.split('\n');
        var maxLen = Math.max(a.length, b.length);
        var html = '';
        for (var i = 0; i < maxLen; i++) {
          var la = a[i] || '', lb = b[i] || '';
          if (la === lb) {
            html += '<div style="padding:1px 4px">' + VS.Tools.escapeHtml(la) + '</div>';
          } else {
            html += '<div style="padding:1px 4px;background:rgba(240,128,152,0.12);color:var(--accent-rose);text-decoration:line-through">' + VS.Tools.escapeHtml(la) + '</div>';
            html += '<div style="padding:1px 4px;background:rgba(104,200,160,0.12);color:var(--accent-mint)">' + VS.Tools.escapeHtml(lb) + '</div>';
          }
        }
        document.getElementById('diffResult').innerHTML = html;
      }
    );
  }

  function showHashModal() {
    var editor = VS.Editor.getEditor();
    var target = editor ? (editor.getSelection() || editor.getValue()) : '';
    VS.UI.showModal('Hash Generator',
      '<textarea id="hashInput" rows="4" style="font-family:monospace;font-size:12px">' + VS.Tools.escapeHtml(target) + '</textarea>' +
      '<button class="btn btn-primary" id="genHash" style="margin-top:6px;width:100%">Generate Hashes</button>' +
      '<div id="hashResult" style="margin-top:8px;font-family:monospace;font-size:11px;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm)"></div>',
      null, true
    );
    document.getElementById('genHash').addEventListener('click', async function() {
      var data = new TextEncoder().encode(document.getElementById('hashInput').value);
      var algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
      var html = '';
      for (var i = 0; i < algorithms.length; i++) {
        var hashBuffer = await crypto.subtle.digest(algorithms[i], data);
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        var hashHex = hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        html += '<div style="margin-bottom:4px"><strong>' + algorithms[i] + ':</strong> ' + hashHex + '</div>';
      }
      document.getElementById('hashResult').innerHTML = html;
    });
  }

  // ---- GitHub Integration ----

  async function cloneRepo(repoFullName) {
    VS.UI.terminalLog('Cloning ' + repoFullName + '...');
    var token = await VS.Crypto.getGitHubToken();
    var headers = token ? { Authorization: 'token ' + token } : {};
    var apiUrl = 'https://api.github.com/repos/' + repoFullName + '/contents';
    await fetchGitDir(apiUrl, '/', headers);
    VS.UI.terminalLog('Clone complete: ' + repoFullName);
    VS.Editor.rebuildTreeImmediate(db, function() { VS.UI.renderSidebar(); });
  }

  async function fetchGitDir(url, currentPath, headers) {
    var res = await fetch(url, { headers: headers });
    if (!res.ok) return;
    var items = await res.json();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemPath = currentPath === '/' ? '/' + item.name : currentPath + '/' + item.name;
      if (item.type === 'file') {
        var contentRes = await fetch(item.download_url);
        var text = await contentRes.text();
        await db.files.put({ path: itemPath, content: text, type: 'file', lastModified: Date.now() });
      } else if (item.type === 'dir') {
        await db.files.put({ path: itemPath, content: null, type: 'folder', lastModified: Date.now() });
        await fetchGitDir(item.url, itemPath, headers);
      }
    }
  }

  async function commitAndPush() {
    var token = await VS.Crypto.getGitHubToken();
    if (!token) { VS.UI.toast('No GitHub token', 'warning'); return; }
    var currentFile = VS.Editor.getCurrentFile();
    if (!currentFile) { VS.UI.toast('Open a file first', 'warning'); return; }
    var commitMsg = prompt('Commit message:');
    if (!commitMsg) return;
    var repoName = prompt('Repo (user/repo):');
    if (!repoName) return;
    var record = await db.files.get(currentFile);
    if (!record) return;
    var repoPath = currentFile.substring(1);
    var getUrl = 'https://api.github.com/repos/' + repoName + '/contents/' + encodeURIComponent(repoPath);
    var headRes = await fetch(getUrl, { headers: { Authorization: 'token ' + token } });
    var sha = null;
    if (headRes.ok) { var data = await headRes.json(); sha = data.sha; }
    // FIX #7: Use modern Base64 encoding
    var contentBase64 = VS.Tools.utf8ToBase64(record.content);
    var putBody = { message: commitMsg, content: contentBase64, branch: 'main' };
    if (sha) putBody.sha = sha;
    var putRes = await fetch(getUrl, {
      method: 'PUT',
      headers: { Authorization: 'token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });
    if (putRes.ok) { VS.UI.toast('Pushed successfully!', 'success'); VS.UI.terminalLog('Pushed: ' + currentFile); }
    else { VS.UI.toast('Push failed', 'error'); VS.UI.terminalLog('Push failed'); }
  }

  // ---- Search ----

  async function performSearch() {
    var query = document.getElementById('searchInput')?.value;
    if (!query) return;
    var results = document.getElementById('searchResults');
    if (!results) return;
    results.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';
    var all = await db.files.toArray();
    var html = '';
    for (var fi = 0; fi < all.length; fi++) {
      var file = all[fi];
      if (file.type !== 'file' || !file.content) continue;
      var lines = file.content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var idx = lines[i].toLowerCase().indexOf(query.toLowerCase());
        if (idx !== -1) {
          var before = VS.Tools.escapeHtml(lines[i].substring(Math.max(0, idx - 30), idx));
          var match = VS.Tools.escapeHtml(lines[i].substring(idx, idx + query.length));
          var after = VS.Tools.escapeHtml(lines[i].substring(idx + query.length, idx + query.length + 30));
          html += '<div class="search-result" data-path="' + VS.Tools.escapeHtml(file.path) + '" data-line="' + (i + 1) + '">' +
            '<div class="file-path">' + VS.Tools.escapeHtml(file.path) + ':' + (i + 1) + '</div>' +
            '<div>...' + before + '<span class="match-line">' + match + '</span>' + after + '...</div></div>';
        }
      }
    }
    results.innerHTML = html || '<div class="empty-state"><i class="fas fa-search"></i><p>No results found</p></div>';
    results.querySelectorAll('.search-result').forEach(function(el) {
      el.addEventListener('click', function() {
        openFile(el.dataset.path).then(function() {
          var editor = VS.Editor.getEditor();
          if (editor) editor.setCursor(parseInt(el.dataset.line) - 1, 0);
        });
      });
    });
  }

  async function performReplace() {
    var query = document.getElementById('searchInput')?.value;
    var replacement = document.getElementById('replaceInput')?.value;
    if (!query) return;
    var editor = VS.Editor.getEditor();
    var currentFile = VS.Editor.getCurrentFile();
    if (editor && currentFile) {
      var content = editor.getValue();
      editor.setValue(content.split(query).join(replacement));
      await saveFile();
      VS.UI.toast('Replaced all occurrences', 'success');
    }
  }

  // ---- File operations wrappers ----

  async function saveFile() {
    await VS.Editor.saveCurrentContent(db);
    VS.Editor.updateStatusBar();
  }

  async function openFile(path) {
    await VS.Editor.openFileByPath(db, path, function() {
      VS.UI.renderSidebar();
      VS.Editor.updateBreadcrumbs(path);
      VS.Editor.updateStatusBar();
      VS.Editor.updateMinimap();
    });
  }

  async function createFile(parent, name) {
    await VS.Editor.createFile(db, parent, name, function() { VS.UI.renderSidebar(); });
  }

  async function createFolder(parent, name) {
    await VS.Editor.createFolder(db, parent, name, function() { VS.UI.renderSidebar(); });
  }

  async function deleteItem(path, type) {
    await VS.Editor.deleteItem(db, path, type, function() { VS.UI.renderSidebar(); });
    VS.UI.toast('Deleted: ' + path.split('/').pop(), 'info');
  }

  async function renameItem(path) {
    var newName = prompt('New name:', path.split('/').pop());
    if (!newName) return;
    try {
      await VS.Editor.renameItem(db, path, newName, function() { VS.UI.renderSidebar(); });
      VS.UI.toast('Renamed to ' + newName, 'success');
    } catch (e) {
      VS.UI.toast(e.message, 'error');
    }
  }

  async function closeTab(path) {
    await VS.Editor.closeTab(db, path, function() { VS.UI.renderSidebar(); });
  }

  function refreshTree() {
    VS.Editor.rebuildTree(db, function() { VS.UI.renderSidebar(); });
  }

  // ---- Copilot ----

  async function sendCopilotMessage(userMsg) {
    var provider = document.getElementById('copilotProvider')?.value;
    var apiKey = await VS.Crypto.getKey(provider);
    if (!apiKey) { VS.UI.toast('Please enter and save an API key for ' + provider, 'warning'); return; }

    VS.Copilot.setStreaming(true);
    VS.UI.updateSendButton();
    VS.UI.addChatMessage('user', userMsg);

    var typingEl = VS.UI.showTypingIndicator();

    try {
      var contextStr = await VS.Copilot.buildContext(selectedContext, db);
      var response = await VS.Copilot.sendMessage(provider, apiKey, userMsg, contextStr);
      if (typingEl) typingEl.remove();
      VS.UI.addChatMessage('assistant', response);
    } catch (e) {
      if (typingEl) typingEl.remove();
      VS.UI.addChatSystemMessage('Error: ' + e.message);
    }
    VS.Copilot.setStreaming(false);
    VS.UI.updateSendButton();
  }

  function updateCopilotSession() { VS.UI.updateSessionInfo(); }
  function updateContextDropdown() { VS.UI.updateContextDropdown(db, selectedContext); }

  // ---- Default Workspace ----

  async function initWorkspace() {
    var all = await db.files.toArray();
    if (all.length === 0) {
      await db.files.add({ path: '/', content: null, type: 'folder', lastModified: Date.now() });
      await db.files.add({ path: '/welcome.js', content: "// Welcome to VS Code Pastel!\n// A beautiful, feature-rich code editor.\n\nconst greeting = \"Hello, World!\";\nconsole.log(greeting);\n\n// Features:\n// - File explorer with IndexedDB storage\n// - AI Copilot (Gemini, Groq, OpenRouter)\n// - Tools: Beautify, Minify, Template, and more\n// - Command Palette (Ctrl+Shift+P)\n// - Integrated terminal\n// - GitHub integration\n// - Sandboxed code execution\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nfor (let i = 0; i < 10; i++) {\n  console.log(`fib(${i}) = ${fibonacci(i)}`);\n}", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/style.css', content: "/* VS Code Pastel - Example Styles */\n:root {\n  --primary: #9878d0;\n  --secondary: #f08098;\n  --accent: #68c8a0;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  background: #fefbff;\n  color: #2d2640;\n  margin: 0;\n  padding: 20px;\n}\n\nh1 {\n  color: var(--primary);\n  font-size: 2rem;\n}\n\n.container {\n  max-width: 800px;\n  margin: 0 auto;\n  padding: 20px;\n  border-radius: 12px;\n  background: rgba(152, 120, 208, 0.05);\n}", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/index.html', content: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>My App</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <div class=\"container\">\n    <h1>Hello World</h1>\n    <p>Welcome to my application!</p>\n  </div>\n  <script src=\"welcome.js\"></script>\n</body>\n</html>", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/src', content: null, type: 'folder', lastModified: Date.now() });
      await db.files.add({ path: '/src/app.js', content: "// Main Application Module\n\nclass App {\n  constructor() {\n    this.modules = [];\n    this.initialized = false;\n  }\n\n  init() {\n    console.log('App initialized');\n    this.initialized = true;\n    return this;\n  }\n\n  addModule(module) {\n    this.modules.push(module);\n    return this;\n  }\n}\n\nconst app = new App();\napp.init();", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/src/utils.js', content: "// Utility Functions\n\nexport function debounce(fn, delay = 300) {\n  let timer;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delay);\n  };\n}\n\nexport function throttle(fn, limit = 100) {\n  let inThrottle;\n  return function (...args) {\n    if (!inThrottle) {\n      fn.apply(this, args);\n      inThrottle = true;\n      setTimeout(() => (inThrottle = false), limit);\n    }\n  };\n}\n\nexport function deepClone(obj) {\n  return JSON.parse(JSON.stringify(obj));\n}", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/data.json', content: "{\n  \"name\": \"my-project\",\n  \"version\": \"1.0.0\",\n  \"description\": \"A sample project\",\n  \"dependencies\": {\n    \"express\": \"^4.18.2\",\n    \"lodash\": \"^4.17.21\"\n  },\n  \"scripts\": {\n    \"start\": \"node src/app.js\",\n    \"dev\": \"nodemon src/app.js\"\n  }\n}", type: 'file', lastModified: Date.now() });
      await db.files.add({ path: '/README.md', content: "# My Project\n\nA beautiful project built with VS Code Pastel.\n\n## Features\n\n- Feature one\n- Feature two\n- Feature three\n\n## Getting Started\n\n```bash\nnpm install\nnpm start\n```\n\n## License\n\nMIT", type: 'file', lastModified: Date.now() });
    }
    VS.Editor.rebuildTreeImmediate(db, function() { VS.UI.renderSidebar(); });
    if (!VS.Editor.getCurrentFile()) await openFile('/welcome.js');
  }

  // ---- Init ----

  async function init() {
    VS.Sandbox.init();
    VS.Editor.initEditor();
    await initWorkspace();
    VS.UI.renderSidebar();
    VS.Editor.updateMinimap();
    VS.UI.terminalLog('VS Code Pastel ready. Type "help" for commands.');
    bindEvents();
  }

  function bindEvents() {
    // Sidebar header buttons
    document.getElementById('btnNewFile')?.addEventListener('click', function() { showNewFileDialog(); });
    document.getElementById('btnNewFolder')?.addEventListener('click', function() { showNewFolderDialog(); });
    document.getElementById('btnRefresh')?.addEventListener('click', function() { refreshTree(); });

    // Activity bar
    document.querySelectorAll('.activity-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var panel = el.dataset.panel;
        if (panel === 'settings') { showSettingsModal(); return; }
        if (panel === 'copilot') {
          var cp = document.getElementById('copilotPanel');
          var wasOpen = !cp.classList.contains('collapsed');
          document.querySelectorAll('.activity-item').forEach(function(a) { a.classList.remove('active'); });
          if (!wasOpen) { el.classList.add('active'); VS.UI.toggleCopilotPanel(true); }
          else { document.querySelector('[data-panel="explorer"]').classList.add('active'); VS.UI.toggleCopilotPanel(false); VS.Editor.setCurrentPanel('explorer'); VS.UI.renderSidebar(); }
          return;
        }
        document.querySelectorAll('.activity-item').forEach(function(a) { a.classList.remove('active'); });
        el.classList.add('active');
        VS.Editor.setCurrentPanel(panel);
        var title = document.getElementById('sidebarTitle');
        if (title) title.textContent = panel.toUpperCase();
        VS.UI.renderSidebar();
        VS.UI.toggleCopilotPanel(false);
      });
    });

    // Bottom panel tabs
    document.querySelectorAll('.bottom-tab').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('.bottom-tab').forEach(function(t) { t.classList.remove('active'); });
        el.classList.add('active');
      });
    });

    // Terminal
    document.getElementById('terminalInput')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var cmd = e.target.value.trim();
        if (cmd) { VS.UI.processTerminalCommand(cmd, db); e.target.value = ''; }
      }
    });

    // Command palette
    document.getElementById('commandInput')?.addEventListener('input', function(e) {
      var val = e.target.value;
      if (val.startsWith('>')) val = val.substring(1);
      VS.UI.filterCommands(val.trim());
    });
    document.getElementById('commandInput')?.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') VS.UI.closeCommandPalette();
      if (e.key === 'Enter') {
        var focused = document.querySelector('.command-item.focused') || document.querySelector('.command-item');
        if (focused) focused.click();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var items = Array.from(document.querySelectorAll('.command-item'));
        var current = items.findIndex(function(i) { return i.classList.contains('focused'); });
        items.forEach(function(i) { i.classList.remove('focused'); });
        var next = e.key === 'ArrowDown' ? Math.min(current + 1, items.length - 1) : Math.max(current - 1, 0);
        if (items[next]) { items[next].classList.add('focused'); items[next].scrollIntoView({ block: 'nearest' }); }
      }
    });
    document.getElementById('commandPalette')?.addEventListener('click', function(e) {
      if (e.target === document.getElementById('commandPalette')) VS.UI.closeCommandPalette();
    });

    // Copilot
    document.getElementById('closeCopilot')?.addEventListener('click', function() {
      VS.UI.toggleCopilotPanel(false);
      document.querySelectorAll('.activity-item').forEach(function(a) { a.classList.remove('active'); });
      document.querySelector('[data-panel="explorer"]')?.classList.add('active');
      VS.Editor.setCurrentPanel('explorer');
      VS.UI.renderSidebar();
    });

    document.getElementById('btnSaveKey')?.addEventListener('click', async function() {
      var provider = document.getElementById('copilotProvider').value;
      var keyInput = document.getElementById('copilotApiKey');
      if (keyInput.dataset.masked) { VS.UI.toast('Key already saved. Clear first to enter a new one.', 'info'); return; }
      var key = keyInput.value.trim();
      if (!key) { VS.UI.toast('Please enter an API key', 'warning'); return; }
      await VS.Crypto.saveKey(provider, key);
      VS.UI.toast('API key saved securely', 'success');
      VS.UI.updateSessionInfo();
    });

    document.getElementById('btnClearKey')?.addEventListener('click', async function() {
      var provider = document.getElementById('copilotProvider').value;
      VS.Crypto.clearKey(provider);
      VS.UI.toast('API key removed', 'info');
      VS.UI.updateSessionInfo();
    });

    document.getElementById('copilotProvider')?.addEventListener('change', function() {
      VS.UI.updateSessionInfo();
      VS.UI.updateContextDropdown(db, selectedContext);
    });

    document.getElementById('contextToggle')?.addEventListener('click', function() {
      var dd = document.getElementById('contextDropdown');
      if (dd) { dd.classList.toggle('open'); if (dd.classList.contains('open')) VS.UI.updateContextDropdown(db, selectedContext); }
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.context-select')) {
        document.getElementById('contextDropdown')?.classList.remove('open');
      }
    });

    document.getElementById('btnSendCopilot')?.addEventListener('click', function() {
      var input = document.getElementById('copilotInput');
      var msg = input ? input.value.trim() : '';
      if (msg) { sendCopilotMessage(msg); input.value = ''; input.style.height = 'auto'; }
    });

    document.getElementById('copilotInput')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('btnSendCopilot')?.click();
      }
    });

    document.getElementById('copilotInput')?.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Global shortcuts
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); VS.UI.openCommandPalette(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveFile(); VS.UI.toast('Saved', 'success'); }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); VS.UI.toggleSidebar(); }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); VS.UI.toggleBottomPanel(); }
      if (e.key === 'Escape') { VS.UI.closeCommandPalette(); VS.UI.closeModal(); }
    });

    // Sidebar resizer
    var sidebarResizer = document.getElementById('sidebarResizer');
    if (sidebarResizer) {
      sidebarResizer.addEventListener('mousedown', function(e) {
        var isResizing = true;
        var sidebar = document.getElementById('sidebar');
        var startX = e.clientX;
        var startWidth = sidebar.offsetWidth;
        var onMove = function(e) {
          if (!isResizing) return;
          var newWidth = Math.max(160, Math.min(500, startWidth + (e.clientX - startX)));
          sidebar.style.width = newWidth + 'px';
        };
        var onUp = function() { isResizing = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Auto-save
    setInterval(function() { saveFile(); }, 15000);
    window.addEventListener('beforeunload', function() { saveFile(); });
  }

  return {
    init, db, selectedContext,
    showNewFileDialog, showNewFolderDialog, showGitHubModal, showSettingsModal,
    executeTool, saveFile, openFile, createFile, createFolder,
    deleteItem, renameItem, closeTab, refreshTree,
    cloneRepo, commitAndPush, performSearch, performReplace,
    sendCopilotMessage, updateCopilotSession, updateContextDropdown
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', function() {
  VS.App.init();
});
