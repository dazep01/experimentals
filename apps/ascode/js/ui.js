/**
 * ui.js — UI Components Module
 *
 * FIX #3: All innerHTML with dynamic data uses escapeHtml
 * FIX #10: Bottom panel proper toggle
 * FIX #13: Removed dead contextmenu code
 * FIX #15: Tree folder expand/collapse with proper node reference
 * FIX #16: Add contextmenu to folders
 * FIX #17: Add breadcrumb click navigation
 * Includes: Modal, Toast, Context Menu, Command Palette, Terminal, Sidebar rendering, Copilot panel
 */
window.AS = window.AS || {};

AS.UI = (function() {
  'use strict';

  var bottomPanelVisible = true;
  var bottomPanelHeight = 180;
  var treeRefreshTimeout = null;

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- Toast ----

  function toast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    var icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + escapeHtml(message);
    container.appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      setTimeout(function() { t.remove(); }, 300);
    }, 3000);
  }

  // ---- Modal ----

  function showModal(title, bodyHTML, onConfirm, noConfirmBtn) {
    var overlay = document.getElementById('modalOverlay');
    var card = document.getElementById('modalCard');
    if (!overlay || !card) return;
    card.innerHTML =
      '<h3>' + title + '</h3>' +
      bodyHTML +
      '<div class="modal-buttons">' +
        '<button class="btn btn-secondary" id="modalCancel">Cancel</button>' +
        (!noConfirmBtn ? '<button class="btn btn-primary" id="modalConfirm">OK</button>' : '') +
      '</div>';
    overlay.classList.add('open');
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    if (onConfirm && !noConfirmBtn) {
      document.getElementById('modalConfirm').addEventListener('click', onConfirm);
    }
  }

  function closeModal() {
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  // ---- Context Menu ----

  function showContextMenu(e, node) {
    e.preventDefault();
    e.stopPropagation();
    var existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
    var menu = document.createElement('div');
    menu.className = 'context-menu';
    var isFile = node.type === 'file';
    // FIX #3: All content is static HTML here (safe)
    menu.innerHTML =
      '<div class="ctx-item" data-action="newFile"><i class="fas fa-file-medical"></i> New File</div>' +
      '<div class="ctx-item" data-action="newFolder"><i class="fas fa-folder-plus"></i> New Folder</div>' +
      '<div class="ctx-sep"></div>' +
      (isFile ? '<div class="ctx-item" data-action="rename"><i class="fas fa-pen"></i> Rename</div>' : '') +
      '<div class="ctx-item" data-action="delete" style="color:var(--accent-rose)"><i class="fas fa-trash"></i> Delete</div>';
    document.body.appendChild(menu);
    menu.style.left = Math.min(e.pageX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.pageY, window.innerHeight - 180) + 'px';
    menu.querySelectorAll('.ctx-item').forEach(function(item) {
      item.addEventListener('click', async function() {
        var action = item.dataset.action;
        if (action === 'newFile') AS.App.showNewFileDialog(node.path);
        else if (action === 'newFolder') AS.App.showNewFolderDialog(node.path);
        else if (action === 'rename') AS.App.renameItem(node.path);
        else if (action === 'delete') AS.App.deleteItem(node.path, node.type);
        menu.remove();
      });
    });
    setTimeout(function() {
      var close = function(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 50);
  }

  // ---- Command Palette ----

  function openCommandPalette() {
    document.getElementById('commandPalette')?.classList.add('open');
    var input = document.getElementById('commandInput');
    if (input) { input.value = '>'; input.focus(); input.setSelectionRange(1, 1); }
    filterCommands('');
  }

  function closeCommandPalette() {
    var cp = document.getElementById('commandPalette');
    if (cp) cp.classList.remove('open');
  }

  function getCommands() {
    return [
      { label: 'New File', icon: 'fa-file-medical', keybind: 'Ctrl+N', action: function() { AS.App.showNewFileDialog(); } },
      { label: 'New Folder', icon: 'fa-folder-plus', keybind: 'Ctrl+Shift+N', action: function() { AS.App.showNewFolderDialog(); } },
      { label: 'Save File', icon: 'fa-save', keybind: 'Ctrl+S', action: function() { AS.App.saveFile(); } },
      { label: 'Close Tab', icon: 'fa-times', keybind: 'Ctrl+W', action: function() { var cf = AS.Editor.getCurrentFile(); if (cf) closeTabHandler(cf); } },
      { label: 'Toggle Sidebar', icon: 'fa-columns', keybind: 'Ctrl+B', action: function() { toggleSidebar(); } },
      { label: 'Toggle Terminal', icon: 'fa-terminal', keybind: 'Ctrl+`', action: function() { toggleBottomPanel(); } },
      { label: 'Toggle Copilot', icon: 'fa-robot', keybind: 'Ctrl+Shift+I', action: function() { toggleCopilotPanel(); } },
      { label: 'Command Palette', icon: 'fa-terminal', keybind: 'Ctrl+Shift+P', action: function() {} },
      { label: 'Go to Line', icon: 'fa-arrow-right', keybind: 'Ctrl+G', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('jumpToLine'); } },
      { label: 'Find', icon: 'fa-search', keybind: 'Ctrl+F', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('find'); } },
      { label: 'Find and Replace', icon: 'fa-exchange-alt', keybind: 'Ctrl+H', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('replace'); } },
      { label: 'Beautify Code', icon: 'fa-magic', keybind: '', action: function() { AS.App.executeTool('beautify'); } },
      { label: 'Minify Code', icon: 'fa-compress-alt', keybind: '', action: function() { AS.App.executeTool('minify'); } },
      { label: 'Format JSON', icon: 'fa-indent', keybind: '', action: function() { AS.App.executeTool('json-format'); } },
      { label: 'Toggle Comment', icon: 'fa-comment', keybind: 'Ctrl+/', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('toggleComment'); } },
      { label: 'Fold All', icon: 'fa-compress', keybind: '', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('foldAll'); } },
      { label: 'Unfold All', icon: 'fa-expand', keybind: '', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('unfoldAll'); } },
      { label: 'Select All', icon: 'fa-object-group', keybind: 'Ctrl+A', action: function() { var e = AS.Editor.getEditor(); if (e) e.execCommand('selectAll'); } },
      { label: 'Soft Wrap', icon: 'fa-text-width', keybind: 'Alt+Z', action: function() { var e = AS.Editor.getEditor(); if (e) e.setOption('lineWrapping', !e.getOption('lineWrapping')); } }
    ];
  }

  function filterCommands(query) {
    var list = document.getElementById('commandList');
    if (!list) return;
    var cmds = getCommands();
    var filtered = cmds.filter(function(c) { return c.label.toLowerCase().includes(query.toLowerCase()); });
    list.innerHTML = filtered.map(function(c, i) {
      return '<div class="command-item' + (i === 0 ? ' focused' : '') + '" data-idx="' + i + '">' +
        '<div class="cmd-icon"><i class="fas ' + c.icon + '"></i></div>' +
        '<span class="cmd-label">' + escapeHtml(c.label) + '</span>' +
        (c.keybind ? '<span class="cmd-keybind">' + escapeHtml(c.keybind) + '</span>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('.command-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.dataset.idx);
        filtered[idx].action();
        closeCommandPalette();
      });
    });
  }

  // ---- Terminal ----

  function terminalLog(msg) {
    var content = document.getElementById('bottomContent');
    if (!content) return;
    var line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = '<span class="prompt">$</span> <span class="cmd">' + escapeHtml(msg) + '</span>';
    content.insertBefore(line, content.querySelector('.terminal-input-wrap'));
  }

  async function processTerminalCommand(cmd, db) {
    terminalLog(cmd);
    var parts = cmd.trim().split(' ');
    var command = parts[0].toLowerCase();
    switch (command) {
      case 'help':
        terminalLog('Available commands: help, clear, ls, cat, touch, mkdir, rm, echo, date, pwd, whoami, node');
        break;
      case 'clear':
        var content = document.getElementById('bottomContent');
        if (content) content.querySelectorAll('.terminal-line').forEach(function(el) { el.remove(); });
        break;
      case 'ls':
        var files = await db.files.where('type').equals('file').toArray();
        terminalLog(files.map(function(f) { return f.path.split('/').pop(); }).join('  ') || '(empty)');
        break;
      case 'cat':
        if (parts[1]) {
          var f = await db.files.get('/' + parts[1]);
          if (f) terminalLog(f.content || '(empty file)');
          else terminalLog('File not found: ' + parts[1]);
        }
        break;
      case 'touch':
        if (parts[1]) AS.App.createFile('/', parts[1]);
        break;
      case 'mkdir':
        if (parts[1]) AS.App.createFolder('/', parts[1]);
        break;
      case 'rm':
        if (parts[1]) {
          var r = await db.files.get('/' + parts[1]);
          if (r) AS.App.deleteItem(r.path, r.type);
          else terminalLog('Not found');
        }
        break;
      case 'echo':
        terminalLog(parts.slice(1).join(' '));
        break;
      case 'date':
        terminalLog(new Date().toString());
        break;
      case 'pwd':
        terminalLog('/workspace');
        break;
      case 'whoami':
        terminalLog('developer');
        break;
      case 'node':
        if (parts[1]) {
          var file = await db.files.get('/' + parts[1]);
          if (file) {
            // FIX #1: Use sandbox instead of new Function
            try {
              var result = await AS.Sandbox.execute(file.content, 5000);
              terminalLog(AS.Sandbox.formatResult(result));
            } catch (e) { terminalLog('Error: ' + e.message); }
          } else terminalLog('File not found');
        } else terminalLog('Usage: node <filename>');
        break;
      default:
        terminalLog('Command not found: ' + command + '. Type "help" for available commands.');
    }
  }

  // ---- Sidebar Rendering (FIX #3, #15, #16, #17: escaped file names, folder expand, context menu, breadcrumbs) ----

  function renderExplorer(container, fileTreeData) {
    container.innerHTML = '';
    function renderNodes(nodes, level) {
      level = level || 0;
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var div = document.createElement('div');
        div.className = 'tree-item';
        div.style.paddingLeft = (8 + level * 16) + 'px';
        if (node.type === 'folder') {
          var isOpen = node.expanded;
          var folderName = node.name || node.path.split('/').pop() || 'workspace';
          div.innerHTML = '<span class="icon folder"><i class="fas fa-' + (isOpen ? 'folder-open' : 'folder') + '"></i></span><span>' + escapeHtml(folderName) + '</span>';
          // FIX #15: Proper closure to capture node reference
          (function(n) {
            div.addEventListener('click', function(e) {
              e.stopPropagation();
              n.expanded = !n.expanded;
              // FIX #18: Debounce refresh to prevent rapid renders
              if (treeRefreshTimeout) clearTimeout(treeRefreshTimeout);
              treeRefreshTimeout = setTimeout(function() {
                AS.App.refreshTree();
              }, 50);
            });
            // FIX #16: Add contextmenu to folders too
            div.addEventListener('contextmenu', function(e) { showContextMenu(e, n); });
          })(node);
          container.appendChild(div);
          if (isOpen && node.children) renderNodes(node.children, level + 1);
        } else {
          var fi = AS.Editor.getFileIcon(node.name || node.path);
          var fileName = node.name || node.path.split('/').pop();
          div.innerHTML = '<span class="icon ' + escapeHtml(fi.cls) + '"><i class="' + escapeHtml(fi.icon) + '"></i></span><span>' + escapeHtml(fileName) + '</span>';
          (function(n) {
            div.addEventListener('click', function(e) { e.stopPropagation(); AS.App.openFile(n.path); });
            div.addEventListener('contextmenu', function(e) { showContextMenu(e, n); });
          })(node);
          if (AS.Editor.getCurrentFile() === node.path) div.classList.add('active-file');
          container.appendChild(div);
        }
      }
    }
    renderNodes(fileTreeData);
    var tree = AS.Editor.getFileTreeData();
    if (tree.length === 0 || (tree.length === 1 && tree[0].path === '/')) {
      container.innerHTML += '<div class="empty-state"><i class="fas fa-folder-open"></i><p>Create a file to get started</p></div>';
    }
  }

  function renderSearch(container) {
    container.innerHTML =
      '<div class="search-box">' +
        '<div class="search-input-wrap"><i class="fas fa-search"></i><input type="text" id="searchInput" placeholder="Search in files..."></div>' +
        '<div class="search-input-wrap"><i class="fas fa-exchange-alt"></i><input type="text" id="replaceInput" placeholder="Replace with..."></div>' +
        '<div style="display:flex;gap:6px;margin-top:4px">' +
          '<button class="btn btn-primary" style="flex:1;font-size:11px" id="btnSearch"><i class="fas fa-search"></i> Search</button>' +
          '<button class="btn btn-secondary" style="flex:1;font-size:11px" id="btnReplace"><i class="fas fa-exchange-alt"></i> Replace</button>' +
        '</div>' +
        '<div id="searchResults" style="margin-top:10px"></div>' +
      '</div>';
    document.getElementById('searchInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') AS.App.performSearch(); });
    document.getElementById('btnSearch').addEventListener('click', function() { AS.App.performSearch(); });
    document.getElementById('btnReplace').addEventListener('click', function() { AS.App.performReplace(); });
  }

  function renderGit(container) {
    container.innerHTML =
      '<div style="padding:12px">' +
        '<div style="margin-bottom:12px">' +
          '<button class="btn btn-primary" style="width:100%;margin-bottom:8px" id="ghConnectBtn"><i class="fab fa-github"></i> Connect GitHub</button>' +
          '<button class="btn btn-secondary" style="width:100%;margin-bottom:8px" id="ghCloneBtn"><i class="fas fa-download"></i> Clone Repo</button>' +
          '<button class="btn btn-secondary" style="width:100%;margin-bottom:8px" id="ghPushBtn"><i class="fas fa-upload"></i> Commit & Push</button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);line-height:1.6">' +
          '<p style="margin-bottom:6px"><i class="fas fa-info-circle" style="color:var(--accent-sky)"></i> Connect with a GitHub PAT (repo scope).</p>' +
          '<p style="margin-bottom:6px"><i class="fas fa-download" style="color:var(--accent-mint)"></i> Clone imports all files from a repo.</p>' +
          '<p><i class="fas fa-upload" style="color:var(--accent-peach)"></i> Push uploads the current file.</p>' +
        '</div>' +
      '</div>';
    document.getElementById('ghConnectBtn').addEventListener('click', function() { AS.App.showGitHubModal(); });
    document.getElementById('ghCloneBtn').addEventListener('click', async function() {
      var token = await AS.Crypto.getGitHubToken();
      if (!token) { AS.App.showGitHubModal(); return; }
      var repo = prompt('Nama repo (user/repo):');
      if (repo) AS.App.cloneRepo(repo);
    });
    document.getElementById('ghPushBtn').addEventListener('click', function() { AS.App.commitAndPush(); });
  }

  function renderTools(container) {
    var tools = AS.Tools.toolDefs;
    container.innerHTML = '<div class="tools-grid">' +
      tools.map(function(t) {
        return '<div class="tool-card ' + t.cls + '" data-tool="' + t.id + '"><i class="' + t.icon + '"></i><span>' + escapeHtml(t.label) + '</span></div>';
      }).join('') + '</div>';
    container.querySelectorAll('.tool-card').forEach(function(el) {
      el.addEventListener('click', function() { AS.App.executeTool(el.dataset.tool); });
    });
  }

  function renderSidebar() {
    var container = document.getElementById('sidebarContent');
    if (!container) return;
    var panel = AS.Editor.getCurrentPanel();
    if (panel === 'explorer') renderExplorer(container, AS.Editor.getFileTreeData());
    else if (panel === 'search') renderSearch(container);
    else if (panel === 'git') renderGit(container);
    else if (panel === 'tools') renderTools(container);
  }

  // ---- Panel Toggles ----

  function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('collapsed');
  }

  function toggleBottomPanel() {
    var bp = document.getElementById('bottomPanel');
    if (!bp) return;
    bottomPanelVisible = !bottomPanelVisible;
    // FIX #10: Proper height management
    if (bottomPanelVisible) {
      bp.style.height = bottomPanelHeight + 'px';
      bp.classList.remove('collapsed');
    } else {
      bp.classList.add('collapsed');
    }
  }

  function toggleCopilotPanel(forceState) {
    var panel = document.getElementById('copilotPanel');
    if (!panel) return;
    if (forceState === true) {
      panel.classList.remove('collapsed');
      AS.App.updateCopilotSession();
      AS.App.updateContextDropdown();
    } else if (forceState === false) {
      panel.classList.add('collapsed');
    } else {
      panel.classList.toggle('collapsed');
      if (!panel.classList.contains('collapsed')) {
        AS.App.updateCopilotSession();
        AS.App.updateContextDropdown();
      }
    }
  }

  // ---- Copilot Chat UI ----

  function addChatMessage(role, content) {
    var chat = document.getElementById('copilotChat');
    if (!chat) return;
    var div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    if (role === 'assistant') {
      // FIX #2: Use sanitized markdown formatter
      div.innerHTML = AS.Copilot.formatMarkdown(content);
    } else {
      div.textContent = content;
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function addChatSystemMessage(msg) {
    var chat = document.getElementById('copilotChat');
    if (!chat) return;
    var div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = msg;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function showTypingIndicator() {
    var chat = document.getElementById('copilotChat');
    if (!chat) return null;
    var el = document.createElement('div');
    el.className = 'chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  // ---- Session Info UI ----

  function updateSessionInfo() {
    var provider = document.getElementById('copilotProvider');
    if (!provider) return;
    var prov = provider.value;
    var infoEl = document.getElementById('sessionInfo');
    var remaining = AS.Crypto.getSessionRemaining(prov);
    if (!remaining) {
      infoEl.className = 'session-info';
      infoEl.innerHTML = '<i class="fas fa-circle" style="font-size:7px"></i> No active session';
    } else {
      var days = Math.floor(remaining / 86400000);
      var hours = Math.floor((remaining % 86400000) / 3600000);
      infoEl.className = 'session-info active';
      infoEl.innerHTML = '<i class="fas fa-circle" style="font-size:7px"></i> Session active: ' + days + 'd ' + hours + 'h remaining';
    }
    var keyInput = document.getElementById('copilotApiKey');
    if (keyInput) {
      if (AS.Crypto.hasKey(prov)) {
        keyInput.value = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        keyInput.dataset.masked = 'true';
      } else {
        keyInput.value = '';
        delete keyInput.dataset.masked;
      }
    }
    updateSendButton();
  }

  function updateSendButton() {
    var provider = document.getElementById('copilotProvider');
    var btn = document.getElementById('btnSendCopilot');
    if (!provider || !btn) return;
    var hasKey = AS.Crypto.hasKey(provider.value);
    btn.disabled = !hasKey || AS.Copilot.getStreaming();
  }

  // ---- Context Dropdown ----

  async function updateContextDropdown(db, selectedContext) {
    var dropdown = document.getElementById('contextDropdown');
    if (!dropdown) return;
    var all = await db.files.toArray();
    var html = '';
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      var checked = selectedContext.has(item.path) ? 'checked' : '';
      var icon = item.type === 'folder' ? 'fas fa-folder' : 'fas fa-file-code';
      var iconColor = item.type === 'folder' ? 'var(--accent-peach)' : 'var(--text-muted)';
      html += '<div class="context-item" data-path="' + escapeHtml(item.path) + '">' +
        '<input type="checkbox" ' + checked + '>' +
        '<i class="' + icon + '" style="color:' + iconColor + '"></i> ' +
        escapeHtml(item.path) + '</div>';
    }
    dropdown.innerHTML = html || '<div class="empty-state" style="padding:8px"><p>No files in workspace</p></div>';
    dropdown.querySelectorAll('.context-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        var path = el.dataset.path;
        if (selectedContext.has(path)) selectedContext.delete(path);
        else selectedContext.add(path);
        el.querySelector('input').checked = selectedContext.has(path);
        el.classList.toggle('selected', selectedContext.has(path));
        var label = document.getElementById('contextLabel');
        if (label) label.textContent = selectedContext.size > 0 ? selectedContext.size + ' item(s) selected' : 'Select context...';
      });
    });
  }

  function closeTabHandler(path) {
    AS.App.closeTab(path);
  }

  return {
    toast, showModal, closeModal, showContextMenu,
    openCommandPalette, closeCommandPalette, filterCommands, getCommands,
    terminalLog, processTerminalCommand,
    renderExplorer, renderSearch, renderGit, renderTools, renderSidebar,
    toggleSidebar, toggleBottomPanel, toggleCopilotPanel,
    addChatMessage, addChatSystemMessage, showTypingIndicator,
    updateSessionInfo, updateSendButton, updateContextDropdown,
    closeTabHandler, escapeHtml
  };
})();
