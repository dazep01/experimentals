/**
 * ForgeEdit AI Widget v2.0
 * Self-contained AI chat widget untuk code editor.
 * 
 * Cara pakai:
 *   Tempel script ini di header halaman editor Anda.
 *   Widget akan otomatis muncul sebagai floating button di pojok kanan bawah.
 * 
 * Fitur:
 *   - Multi-provider: Gemini, Groq, OpenRouter
 *   - Context-aware: pilih file/folder dari editor
 *   - Upload file untuk analisis
 *   - Chat history dengan TTL
 *   - IndexedDB untuk penyimpanan file
 *   - Shortcut keyboard: Ctrl+K
 * 
 * @license MIT
 */
(function () {
  'use strict';

  // ==================== KONFIGURASI ====================
  const CONFIG = {
    APP_KEY: 'forgeedit_ai_widget_v2',
    MAX_TTL_HOURS: 168,
    DEFAULT_TTL_HOURS: 24,
    DB_NAME: 'ForgeEditDB',
    DB_VER: 2,
    STORE_FILES: 'files',
    PROVIDERS: {
      gemini: {
        name: 'Gemini',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{{model}}:streamGenerateContent?alt=sse&key={{key}}',
        defaultModel: 'gemini-2.0-flash',
        transformRequest: (model, key, messages, systemPrompt, context) => {
          const contents = [];
          if (systemPrompt) {
            contents.push({
              role: 'user',
              parts: [{
                text: `[SYSTEM INSTRUCTION]\n${systemPrompt}`
              }]
            });
            contents.push({
              role: 'model',
              parts: [{
                text: 'Okay, saya mengerti instruksi system.'
              }]
            });
          }
          if (context) {
            contents.push({
              role: 'user',
              parts: [{
                text: `[CONTEXT]\n${context}`
              }]
            });
            contents.push({
              role: 'model',
              parts: [{
                text: 'Konteks diterima.'
              }]
            });
          }
          messages.forEach(msg => {
            const role = msg.role === 'ai' ? 'model' : 'user';
            contents.push({
              role,
              parts: [{
                text: msg.content
              }]
            });
          });
          return {
            contents
          };
        },
        parseChunk: (chunk) => {
          try {
            const data = JSON.parse(chunk);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || null;
          } catch {
            return null;
          }
        }
      },
      groq: {
        name: 'Groq',
        defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        transformRequest: (model, key, messages, systemPrompt, context) => {
          const msgs = [];
          if (systemPrompt) msgs.push({
            role: 'system',
            content: systemPrompt
          });
          if (context) msgs.push({
            role: 'system',
            content: `[CONTEXT]\n${context}`
          });
          messages.forEach(msg => msgs.push({
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content
          }));
          return {
            model,
            messages: msgs,
            stream: true
          };
        },
        parseChunk: (chunk) => {
          try {
            const data = JSON.parse(chunk);
            return data.choices?.[0]?.delta?.content || null;
          } catch {
            return null;
          }
        }
      },
      openrouter: {
        name: 'OpenRouter',
        defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'google/gemini-2.0-flash-001',
        transformRequest: (model, key, messages, systemPrompt, context) => {
          const msgs = [];
          if (systemPrompt) msgs.push({
            role: 'system',
            content: systemPrompt
          });
          if (context) msgs.push({
            role: 'system',
            content: `[CONTEXT]\n${context}`
          });
          messages.forEach(msg => msgs.push({
            role: msg.role === 'ai' ? 'assistant' : 'user',
            content: msg.content
          }));
          return {
            model,
            messages: msgs,
            stream: true
          };
        },
        parseChunk: (chunk) => {
          try {
            const data = JSON.parse(chunk);
            return data.choices?.[0]?.delta?.content || null;
          } catch {
            return null;
          }
        }
      }
    }
  };

  // ==================== STATE ====================
  let db = null;
  let isPanelOpen = false;
  let isSettingsOpen = false;
  let isContextOpen = false;
  let contextTree = {
    name: '/',
    path: '/',
    type: 'folder',
    children: new Map(),
    depth: 0
  };
  let draftTimer = null;

  const state = {
    messages: [],
    contextPaths: new Set(),
    uploadFiles: [],
    ui: {
      panelExpanded: false
    },
    settings: {
      provider: '',
      apiKey: '',
      model: '',
      endpoint: '',
      systemPrompt: '',
      ttlHours: CONFIG.DEFAULT_TTL_HOURS,
      stream: true,
      rememberUI: true,
      autoOpen: false,
      useContext: true
    }
  };

  // ==================== DOM ELEMENTS ====================
  let els = {};

  function createDOM() {
    const root = document.createElement('div');
    root.id = 'feai-root';
    root.innerHTML = `
                <div class="feai-backdrop" id="feai-backdrop"></div>
                <button class="feai-launcher" id="feai-launcher" type="button" aria-label="Open AI Chat" title="ForgeEdit AI (Ctrl+K)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a7 7 0 0 0-7 7v3a7 7 0 0 0 7 7h1l4 3v-3a7 7 0 0 0 3-5V9a7 7 0 0 0-7-7z"></path>
                    <path d="M8 10h8"></path><path d="M8 13h5"></path>
                  </svg>
                </button>
                <section class="feai-panel" id="feai-panel" aria-hidden="true">
                  <header class="feai-header">
                    <div class="feai-brand">
                      <div class="feai-logo" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z"></path><path d="M12 2v20"></path><path d="M4 6.5l8 4.5 8-4.5"></path></svg>
                      </div>
                      <div class="feai-title-wrap">
                        <div class="feai-title">ForgeEdit AI</div>
                        <div class="feai-subtitle" id="feai-subtitle">Provider: none · Model: none · Context: 0</div>
                      </div>
                    </div>
                    <div class="feai-header-actions">
                      <button class="feai-icon-btn" id="feai-open-settings" title="Settings">⚙</button>
                      <button class="feai-icon-btn" id="feai-open-context" title="Context">⊞</button>
                      <button class="feai-icon-btn" id="feai-upload-context" title="Upload file">⤴</button>
                      <button class="feai-icon-btn" id="feai-close-chat" title="Close">✕</button>
                    </div>
                  </header>
                  <div class="feai-actions">
                    <button class="feai-chip primary" id="feai-action-settings">⚙ Setting</button>
                    <button class="feai-chip" id="feai-action-context">⊞ Context</button>
                    <button class="feai-chip" id="feai-action-upload">⤴ Upload</button>
                    <button class="feai-chip danger" id="feai-action-reset-history">↺ Reset History</button>
                    <button class="feai-chip danger" id="feai-action-reset-api">⌫ Reset API</button>
                    <button class="feai-chip success" id="feai-action-clear-all">🧹 Clear All</button>
                  </div>
                  <div class="feai-body">
                    <div class="feai-status">
                      <div class="feai-context-summary">
                        <span class="feai-pill" id="feai-pill-provider">Provider: none</span>
                        <span class="feai-pill" id="feai-pill-model">Model: none</span>
                        <span class="feai-pill" id="feai-pill-ttl">TTL: 24h</span>
                      </div>
                      <div class="feai-badge" id="feai-badge-context">0 context</div>
                    </div>
                    <div class="feai-messages" id="feai-messages"></div>
                    <div class="feai-input-wrap">
                      <div class="feai-input-bar">
                        <textarea class="feai-textarea" id="feai-input" rows="1" placeholder="Tulis pesan, Enter kirim, Shift+Enter baris baru..."></textarea>
                        <button class="feai-send" id="feai-send" type="button" aria-label="Send">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path></svg>
                        </button>
                      </div>
                      <div class="feai-helper-row">
                        <div>Draft auto-saved ke localStorage.</div>
                        <div class="feai-mini-actions">
                          <button class="feai-mini-btn" id="feai-mini-expand">Expand</button>
                          <button class="feai-mini-btn" id="feai-mini-collapse">Collapse</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section class="feai-modal" id="feai-settings-modal" aria-hidden="true">
                  <div class="feai-modal-head"><div class="feai-modal-title">AI Settings</div><button class="feai-modal-close" data-close="settings">✕</button></div>
                  <div class="feai-modal-body">
                    <div class="feai-grid">
                      <div class="feai-field"><div class="feai-label">Provider</div><select class="feai-select" id="feai-provider"><option value="">Select provider</option><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></div>
                      <div class="feai-field"><div class="feai-label">Session TTL</div><select class="feai-select" id="feai-ttl"><option value="24">24 jam</option><option value="48">48 jam</option><option value="72">72 jam</option><option value="96">96 jam</option><option value="120">120 jam</option><option value="144">144 jam</option><option value="168">168 jam (7 hari)</option></select></div>
                    </div>
                    <div class="feai-grid">
                      <div class="feai-field"><div class="feai-label">API Key</div><input class="feai-input" id="feai-api-key" type="password" placeholder="Masukkan API key" autocomplete="off"></div>
                      <div class="feai-field"><div class="feai-label">Model</div><input class="feai-input" id="feai-model" type="text" placeholder="contoh: gemini-2.0-flash" autocomplete="off"></div>
                    </div>
                    <div class="feai-grid">
                      <div class="feai-field"><div class="feai-label">Endpoint (optional)</div><input class="feai-input" id="feai-endpoint" type="text" placeholder="Custom endpoint" autocomplete="off"></div>
                      <div class="feai-field"><div class="feai-label">System Prompt</div><input class="feai-input" id="feai-system-prompt" type="text" placeholder="Role / system instruction" autocomplete="off"></div>
                    </div>
                    <div class="feai-field"><div class="feai-label">Options</div><div class="feai-switches">
                      <label class="feai-toggle"><input type="checkbox" id="feai-stream" checked> Streaming</label>
                      <label class="feai-toggle"><input type="checkbox" id="feai-remember-ui" checked> Save UI state</label>
                      <label class="feai-toggle"><input type="checkbox" id="feai-auto-open"> Auto open</label>
                      <label class="feai-toggle"><input type="checkbox" id="feai-use-context" checked> Use context</label>
                    </div></div>
                    <div class="feai-row" style="margin-top:8px;flex-wrap:wrap;gap:8px;">
                      <button class="feai-chip" id="feai-save-settings">Save Settings</button>
                      <button class="feai-chip danger" id="feai-reset-api-btn">Reset API</button>
                      <button class="feai-chip danger" id="feai-reset-history-btn">Reset History</button>
                      <button class="feai-chip success" id="feai-save-ttl-btn">Save TTL</button>
                    </div>
                    <div class="feai-note" style="margin-top:10px;">API, model, TTL, dan histori disimpan di localStorage dengan masa hidup terkontrol.</div>
                  </div>
                </section>
                <section class="feai-modal" id="feai-context-modal" aria-hidden="true">
                  <div class="feai-modal-head"><div class="feai-modal-title">Context Picker</div><button class="feai-modal-close" data-close="context">✕</button></div>
                  <div class="feai-modal-body">
                    <div class="feai-row" style="margin-bottom:12px;align-items:center;justify-content:space-between;">
                      <input class="feai-input" id="feai-context-search" type="text" placeholder="Cari file / folder..." style="flex:1;min-width:200px;">
                      <button class="feai-chip" id="feai-context-refresh">↻ Refresh</button>
                    </div>
                    <div class="feai-context-list" id="feai-context-list"><div class="feai-empty">Belum ada data context.</div></div>
                    <div class="feai-footer-actions">
                      <button class="feai-chip" id="feai-context-select-all">Select all</button>
                      <button class="feai-chip" id="feai-context-clear">Clear</button>
                      <button class="feai-chip primary" id="feai-context-apply">Apply Context</button>
                    </div>
                  </div>
                </section>
                <input class="feai-file-upload" id="feai-file-upload" type="file" multiple>
              `;
    document.body.appendChild(root);
  }

  function cacheElements() {
    const get = (id) => document.getElementById(id);
    els = {
      root: get('feai-root'),
      backdrop: get('feai-backdrop'),
      launcher: get('feai-launcher'),
      panel: get('feai-panel'),
      subtitle: get('feai-subtitle'),
      messages: get('feai-messages'),
      input: get('feai-input'),
      send: get('feai-send'),
      closeChat: get('feai-close-chat'),
      openSettings: get('feai-open-settings'),
      openContext: get('feai-open-context'),
      uploadContext: get('feai-upload-context'),
      actionSettings: get('feai-action-settings'),
      actionContext: get('feai-action-context'),
      actionUpload: get('feai-action-upload'),
      actionResetHistory: get('feai-action-reset-history'),
      actionResetApi: get('feai-action-reset-api'),
      actionClearAll: get('feai-action-clear-all'),
      pillProvider: get('feai-pill-provider'),
      pillModel: get('feai-pill-model'),
      pillTTL: get('feai-pill-ttl'),
      badgeContext: get('feai-badge-context'),
      settingsModal: get('feai-settings-modal'),
      contextModal: get('feai-context-modal'),
      provider: get('feai-provider'),
      ttl: get('feai-ttl'),
      apiKey: get('feai-api-key'),
      model: get('feai-model'),
      endpoint: get('feai-endpoint'),
      systemPrompt: get('feai-system-prompt'),
      stream: get('feai-stream'),
      rememberUI: get('feai-remember-ui'),
      autoOpen: get('feai-auto-open'),
      useContext: get('feai-use-context'),
      saveSettings: get('feai-save-settings'),
      resetApiBtn: get('feai-reset-api-btn'),
      resetHistoryBtn: get('feai-reset-history-btn'),
      saveTTLBtn: get('feai-save-ttl-btn'),
      contextSearch: get('feai-context-search'),
      contextList: get('feai-context-list'),
      contextRefresh: get('feai-context-refresh'),
      contextSelectAll: get('feai-context-select-all'),
      contextClear: get('feai-context-clear'),
      contextApply: get('feai-context-apply'),
      fileUpload: get('feai-file-upload'),
      miniExpand: get('feai-mini-expand'),
      miniCollapse: get('feai-mini-collapse')
    };
  }

  // ==================== UTILITY ====================
  const now = () => Date.now();
  const clampTTL = (h) => Math.max(24, Math.min(CONFIG.MAX_TTL_HOURS, Number(h || CONFIG.DEFAULT_TTL_HOURS)));
  const safeText = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g,
      '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const storageKey = (name) => `${CONFIG.APP_KEY}:${name}`;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(storageKey(key));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed) {
        if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < now()) {
          localStorage.removeItem(storageKey(key));
          return fallback;
        }
      }
      return parsed?.value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value, ttlHours) {
    const ttl = clampTTL(ttlHours ?? state.settings.ttlHours);
    const payload = {
      value,
      savedAt: now(),
      expiresAt: now() + ttl * 60 * 60 * 1000
    };
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(payload));
    } catch (e) {
      console.warn('[ForgeEditAI] localStorage penuh:', e.message);
    }
  }

  function removeStored(key) {
    localStorage.removeItem(storageKey(key));
  }

  // ==================== SETTINGS ====================
  function loadSettings() {
    const stored = loadJSON('settings', null);
    if (stored && typeof stored === 'object') Object.assign(state.settings, stored);
    state.settings.ttlHours = clampTTL(state.settings.ttlHours);
  }

  function saveSettingsToStorage() {
    saveJSON('settings', {
      ...state.settings
    }, state.settings.ttlHours);
  }

  function syncSettingsInputs() {
    if (!els.provider) return;
    els.provider.value = state.settings.provider;
    els.apiKey.value = state.settings.apiKey;
    els.model.value = state.settings.model;
    els.endpoint.value = state.settings.endpoint;
    els.systemPrompt.value = state.settings.systemPrompt;
    els.ttl.value = String(state.settings.ttlHours);
    els.stream.checked = !!state.settings.stream;
    els.rememberUI.checked = !!state.settings.rememberUI;
    els.autoOpen.checked = !!state.settings.autoOpen;
    els.useContext.checked = !!state.settings.useContext;
  }

  function readSettingsInputs() {
    state.settings.provider = els.provider.value.trim();
    state.settings.apiKey = els.apiKey.value.trim();
    state.settings.model = els.model.value.trim();
    state.settings.endpoint = els.endpoint.value.trim();
    state.settings.systemPrompt = els.systemPrompt.value.trim();
    state.settings.ttlHours = clampTTL(els.ttl.value);
    state.settings.stream = !!els.stream.checked;
    state.settings.rememberUI = !!els.rememberUI.checked;
    state.settings.autoOpen = !!els.autoOpen.checked;
    state.settings.useContext = !!els.useContext.checked;
  }

  function saveAllSettings() {
    readSettingsInputs();
    saveSettingsToStorage();
    updateSubtitle();
  }

  function resetApi() {
    state.settings.apiKey = '';
    state.settings.endpoint = '';
    state.settings.model = '';
    state.settings.provider = '';
    saveAllSettings();
    syncSettingsInputs();
  }

  // ==================== MESSAGES ====================
  function loadMessages() {
    const msgs = loadJSON('history', []);
    state.messages = Array.isArray(msgs) ? msgs : [];
  }

  function saveMessages() {
    saveJSON('history', state.messages, state.settings.ttlHours);
  }

  function renderMessages() {
    if (!els.messages) return;
    els.messages.innerHTML = state.messages.length ?
      state.messages.map(m => {
        const role = m.role || 'system';
        const text = safeText(m.content || '');
        const time = m.ts ? new Date(m.ts)
          .toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }) : '';
        return `<div class="feai-msg ${role}"><div>${text}</div>${time ? `<div class="meta">${safeText(time)}</div>` : ''}</div>`;
      })
      .join('') :
      '<div class="feai-msg system">Chat kosong. Mulai percakapan, lalu provider dan konteks bisa dipakai langsung.</div>';
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function addMessage(role, content) {
    state.messages.push({
      role,
      content,
      ts: now()
    });
    saveMessages();
    renderMessages();
  }

  function setTyping(on) {
    const existing = document.getElementById('feai-typing');
    if (on) {
      if (existing) return;
      const el = document.createElement('div');
      el.className = 'feai-msg ai';
      el.id = 'feai-typing';
      el.innerHTML =
        '<span class="feai-typing">Sedang mengetik <span class="feai-dots"><span></span><span></span><span></span></span></span>';
      els.messages.appendChild(el);
      els.messages.scrollTop = els.messages.scrollHeight;
    } else {
      if (existing) existing.remove();
    }
  }

  function resetHistory() {
    state.messages = [];
    removeStored('history');
    renderMessages();
  }

  // ==================== UI ====================
  function updateSubtitle() {
    if (!els.subtitle) return;
    els.subtitle.textContent =
      `Provider: ${state.settings.provider || 'none'} · Model: ${state.settings.model || 'none'} · Context: ${state.contextPaths.size}`;
    els.pillProvider.textContent = `Provider: ${state.settings.provider || 'none'}`;
    els.pillModel.textContent = `Model: ${state.settings.model || 'none'}`;
    els.pillTTL.textContent = `TTL: ${state.settings.ttlHours}h`;
    els.badgeContext.textContent = `${state.contextPaths.size} context`;
  }

  function openPanel() {
    if (!els.panel) return;
    els.panel.classList.add('open');
    els.backdrop.classList.add('open');
    els.panel.setAttribute('aria-hidden', 'false');
    isPanelOpen = true;
    if (state.settings.rememberUI) saveJSON('ui', {
        panelOpen: true,
        expanded: state.ui.panelExpanded
      },
      state.settings.ttlHours);
    setTimeout(() => els.input?.focus(), 100);
  }

  function closePanel() {
    if (!els.panel) return;
    els.panel.classList.remove('open');
    els.backdrop.classList.remove('open');
    els.panel.setAttribute('aria-hidden', 'true');
    closeModal('settings');
    closeModal('context');
    isPanelOpen = false;
    if (state.settings.rememberUI) saveJSON('ui', {
        panelOpen: false,
        expanded: state.ui.panelExpanded
      },
      state.settings.ttlHours);
  }

  function togglePanel() {
    isPanelOpen ? closePanel() : openPanel();
  }

  function openModal(which) {
    if (which === 'settings' && els.settingsModal) {
      els.settingsModal.classList.add('open');
      els.settingsModal.setAttribute('aria-hidden', 'false');
      isSettingsOpen = true;
      syncSettingsInputs();
    }
    if (which === 'context' && els.contextModal) {
      els.contextModal.classList.add('open');
      els.contextModal.setAttribute('aria-hidden', 'false');
      isContextOpen = true;
      renderContextTree();
    }
    if (els.backdrop) els.backdrop.classList.add('open');
  }

  function closeModal(which) {
    if (which === 'settings' && els.settingsModal) {
      els.settingsModal.classList.remove('open');
      els.settingsModal.setAttribute('aria-hidden', 'true');
      isSettingsOpen = false;
    }
    if (which === 'context' && els.contextModal) {
      els.contextModal.classList.remove('open');
      els.contextModal.setAttribute('aria-hidden', 'true');
      isContextOpen = false;
    }
    if (!isPanelOpen && els.backdrop) els.backdrop.classList.remove('open');
  }

  function applyExpandedState() {
    if (!els.panel) return;
    els.panel.style.height = state.ui.panelExpanded ? 'min(95vh, 1080px)' : 'min(90vh, 900px)';
  }

  function toggleExpanded(force) {
    state.ui.panelExpanded = typeof force === 'boolean' ? force : !state.ui.panelExpanded;
    applyExpandedState();
    if (els.input) autoGrowTextarea(els.input);
    if (state.settings.rememberUI) saveDraft();
  }

  function autoGrowTextarea(el) {
    el.style.height = 'auto';
    const target = Math.min(el.scrollHeight, state.ui.panelExpanded ? 300 : 180);
    el.style.height = Math.max(target, 50) + 'px';
  }

  function saveDraft() {
    if (!state.settings.rememberUI) return;
    saveJSON('draft', {
        input: els.input?.value || '',
        expanded: state.ui.panelExpanded
      }, state.settings
      .ttlHours);
  }

  function loadDraft() {
    const d = loadJSON('draft', null);
    if (d && typeof d === 'object' && els.input) {
      els.input.value = d.input || '';
      state.ui.panelExpanded = !!d.expanded;
      applyExpandedState();
    }
  }

  function debounceDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 300);
  }

  // ==================== INDEXEDDB ====================
  async function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VER);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(CONFIG.STORE_FILES)) {
          const s = d.createObjectStore(CONFIG.STORE_FILES, {
            keyPath: 'path'
          });
          s.createIndex('parent', 'parent', {
            unique: false
          });
          s.createIndex('type', 'type', {
            unique: false
          });
          s.createIndex('modified', 'modified', {
            unique: false
          });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbTx(store, mode) {
    return db.transaction(store, mode)
      .objectStore(store);
  }

  function dbGetAll(store) {
    return new Promise((resolve, reject) => {
      const r = dbTx(store, 'readonly')
        .getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  function normalizePath(path) {
    return String(path || '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  async function loadContextTree() {
    if (!db) return;
    const all = await dbGetAll(CONFIG.STORE_FILES);
    const nodes = all.filter(item => item && item.path && item.type)
      .map(item => ({
        path: item.path,
        name: item.name || item.path.split('/')
          .pop(),
        type: item.type,
        parent: item.parent || '/',
        modified: item.modified || 0,
        open: !!item.open
      }));
    contextTree = buildTree(nodes);
  }

  function buildTree(files) {
    const root = {
      name: '/',
      path: '/',
      type: 'folder',
      children: new Map(),
      depth: 0
    };
    files.forEach(f => {
      const parts = normalizePath(f.path)
        .split('/')
        .filter(Boolean);
      let node = root;
      let current = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        current = current ? current + '/' + part : part;
        if (!node.children.has(part)) {
          node.children.set(part, {
            name: part,
            path: current,
            type: i === parts.length - 1 ? f.type : 'folder',
            parent: i === 0 ? '/' : current.split('/')
              .slice(0, -1)
              .join('/') || '/',
            children: new Map(),
            depth: i + 1
          });
        }
        node = node.children.get(part);
      }
    });
    return root;
  }

  function flattenTree(node, out = []) {
    const entries = Array.from(node.children.values())
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    for (const entry of entries) {
      out.push(entry);
      if (entry.children && entry.children.size) flattenTree(entry, out);
    }
    return out;
  }

  function renderContextTree() {
    if (!els.contextList) return;
    if (!contextTree || !contextTree.children || contextTree.children.size === 0) {
      els.contextList.innerHTML = '<div class="feai-empty">Tidak ada file/folder. Upload file atau gunakan API editor untuk menambah konteks.</div>';
      return;
    }
    const q = (els.contextSearch?.value || '')
      .trim()
      .toLowerCase();
    const entries = flattenTree(contextTree)
      .filter(item => {
        if (!q) return true;
        return item.path.toLowerCase()
          .includes(q) || item.name.toLowerCase()
          .includes(q);
      });
    if (!entries.length) {
      els.contextList.innerHTML = '<div class="feai-empty">Tidak ada hasil pencarian.</div>';
      return;
    }
    let html = '<ul class="feai-tree">';
    for (const item of entries) {
      const isFolder = item.type === 'folder';
      const checked = state.contextPaths.has(item.path) ? 'checked' : '';
      const indent = Math.max(0, item.depth - 1) * 18;
      html += `
                <li>
                  <div class="feai-tree-item ${isFolder ? 'folder' : ''}" style="margin-left:${indent}px">
                    <span class="feai-caret" data-caret="${safeText(item.path)}">${isFolder ? '▸' : '•'}</span>
                    <input class="feai-checked" type="checkbox" data-path="${safeText(item.path)}" ${checked}>
                    <div class="label"><div class="name">${safeText(item.name)}</div><div class="path">${safeText(item.path)}</div></div>
                    <span class="feai-badge">${safeText(item.type)}</span>
                  </div>
                </li>`;
    }
    html += '</ul>';
    els.contextList.innerHTML = html;
  }

  function saveContextSelection() {
    saveJSON('context', Array.from(state.contextPaths), state.settings.ttlHours);
    updateSubtitle();
  }

  function loadContextSelection() {
    const saved = loadJSON('context', []);
    state.contextPaths = new Set(Array.isArray(saved) ? saved : []);
  }

  function collectContextPayload() {
    let ctxText = '';
    if (state.settings.useContext && state.contextPaths.size > 0) {
      ctxText += 'Selected files/folders:\n' + Array.from(state.contextPaths)
        .map(p => `- ${p}`)
        .join('\n') +
        '\n';
    }
    if (state.uploadFiles.length > 0) {
      ctxText += 'Uploaded files:\n' + state.uploadFiles.map(f => `- ${f.name} (${f.size} bytes)`)
        .join('\n') +
        '\n';
    }
    return ctxText || null;
  }

  function importSelectionFromContextCheckboxes() {
    const boxes = els.contextList.querySelectorAll('input[type="checkbox"][data-path]');
    state.contextPaths = new Set(Array.from(boxes)
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.path));
    saveContextSelection();
    updateSubtitle();
  }

  function selectAllContext(checked) {
    els.contextList.querySelectorAll('input[type="checkbox"][data-path]')
      .forEach(cb => {
        cb.checked = checked;
      });
    importSelectionFromContextCheckboxes();
  }

  async function refreshContextTree() {
    await loadContextTree();
    renderContextTree();
    updateSubtitle();
  }

  function uploadFiles() {
    if (els.fileUpload) {
      els.fileUpload.value = '';
      els.fileUpload.click();
    }
  }

  function handleUploadedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const items = files.map(file => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      content: null
    }));
    state.uploadFiles = items;
    saveJSON('uploads', items, state.settings.ttlHours);
    addMessage('system', `📎 ${items.length} file ditambahkan ke konteks upload.`);
    // juga tambahkan ke context tree virtual
    items.forEach(f => {
      const path = `uploads/${f.name}`;
      if (!contextTree.children.has('uploads')) {
        contextTree.children.set('uploads', {
          name: 'uploads',
          path: 'uploads',
          type: 'folder',
          parent: '/',
          children: new Map(),
          depth: 1
        });
      }
      const uploadsNode = contextTree.children.get('uploads');
      if (!uploadsNode.children.has(f.name)) {
        uploadsNode.children.set(f.name, {
          name: f.name,
          path,
          type: 'file',
          parent: 'uploads',
          children: new Map(),
          depth: 2
        });
      }
    });
    renderContextTree();
  }

  function clearAll() {
    resetHistory();
    resetApi();
    state.contextPaths.clear();
    state.uploadFiles = [];
    removeStored('context');
    removeStored('uploads');
    updateSubtitle();
    renderContextTree();
  }

  // ==================== AI API ====================
  async function sendMessage() {
    if (!els.input) return;
    const text = els.input.value.trim();
    if (!text) return;
    if (!state.settings.apiKey || !state.settings.provider) {
      addMessage('system',
        '⚠️ Silakan atur API Key dan Provider terlebih dahulu di Settings (⚙). Didukung: Gemini, Groq, OpenRouter.');
      return;
    }
    addMessage('user', text);
    els.input.value = '';
    autoGrowTextarea(els.input);
    saveDraft();
    setTyping(true);

    const contextText = collectContextPayload();
    const providerCfg = CONFIG.PROVIDERS[state.settings.provider];
    if (!providerCfg) {
      setTyping(false);
      addMessage('system', 'Provider tidak dikenal.');
      return;
    }

    const endpoint = state.settings.endpoint || providerCfg.defaultEndpoint;
    const model = state.settings.model || providerCfg.defaultModel;
    const apiKey = state.settings.apiKey;

    try {
      let fullResponse = '';
      if (state.settings.stream) {
        fullResponse = await streamAIRequest(providerCfg, endpoint, model, apiKey, contextText);
      } else {
        fullResponse = await nonStreamAIRequest(providerCfg, endpoint, model, apiKey, contextText);
      }
      setTyping(false);
      addMessage('ai', fullResponse || '(respons kosong)');
    } catch (err) {
      setTyping(false);
      console.error('[ForgeEditAI] Error:', err);
      addMessage('system', `❌ Gagal: ${err.message || 'Kesalahan jaringan atau API.'}`);
    }
  }

  async function streamAIRequest(providerCfg, endpoint, model, apiKey, contextText) {
    const reqBody = providerCfg.transformRequest(model, apiKey, state.messages, state.settings.systemPrompt,
      contextText);
    const url = endpoint
      .replace('{{model}}', encodeURIComponent(model))
      .replace('{{key}}', encodeURIComponent(apiKey));

    let headers = {
      'Content-Type': 'application/json'
    };
    if (state.settings.provider === 'gemini') {
      // Gemini menggunakan API key di URL
    } else if (state.settings.provider === 'groq') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (state.settings.provider === 'openrouter') {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'ForgeEdit AI Widget';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const {
        done,
        value
      } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {
        stream: true
      });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        let dataStr = trimmed;
        if (dataStr.startsWith('data: ')) dataStr = dataStr.slice(6);
        const text = providerCfg.parseChunk(dataStr);
        if (text) fullText += text;
      }
    }
    // proses sisa buffer
    if (buffer.trim()) {
      const dataStr = buffer.trim()
        .startsWith('data: ') ? buffer.trim()
        .slice(6) : buffer.trim();
      const text = providerCfg.parseChunk(dataStr);
      if (text) fullText += text;
    }
    return fullText;
  }

  async function nonStreamAIRequest(providerCfg, endpoint, model, apiKey, contextText) {
    const reqBody = providerCfg.transformRequest(model, apiKey, state.messages, state.settings.systemPrompt,
      contextText);
    const url = endpoint
      .replace('{{model}}', encodeURIComponent(model))
      .replace('{{key}}', encodeURIComponent(apiKey));

    let headers = {
      'Content-Type': 'application/json'
    };
    if (state.settings.provider === 'groq') headers['Authorization'] = `Bearer ${apiKey}`;
    if (state.settings.provider === 'openrouter') {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = window.location.origin;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    if (state.settings.provider === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    return data.choices?.[0]?.message?.content || '';
  }

  // ==================== EVENT BINDING ====================
  function bindEvents() {
    els.launcher?.addEventListener('click', togglePanel);
    els.backdrop?.addEventListener('click', () => {
      if (isPanelOpen) closePanel();
    });
    els.closeChat?.addEventListener('click', closePanel);
    els.openSettings?.addEventListener('click', () => openModal('settings'));
    els.openContext?.addEventListener('click', () => openModal('context'));
    els.uploadContext?.addEventListener('click', uploadFiles);
    els.actionSettings?.addEventListener('click', () => openModal('settings'));
    els.actionContext?.addEventListener('click', () => openModal('context'));
    els.actionUpload?.addEventListener('click', uploadFiles);
    els.actionResetHistory?.addEventListener('click', resetHistory);
    els.actionResetApi?.addEventListener('click', resetApi);
    els.actionClearAll?.addEventListener('click', clearAll);
    els.saveSettings?.addEventListener('click', saveAllSettings);
    els.resetApiBtn?.addEventListener('click', resetApi);
    els.resetHistoryBtn?.addEventListener('click', resetHistory);
    els.saveTTLBtn?.addEventListener('click', saveAllSettings);
    els.contextRefresh?.addEventListener('click', refreshContextTree);
    els.contextSelectAll?.addEventListener('click', () => selectAllContext(true));
    els.contextClear?.addEventListener('click', () => selectAllContext(false));
    els.contextApply?.addEventListener('click', () => {
      importSelectionFromContextCheckboxes();
      closeModal('context');
    });
    els.fileUpload?.addEventListener('change', (e) => handleUploadedFiles(e.target.files));
    els.send?.addEventListener('click', sendMessage);
    els.input?.addEventListener('input', () => {
      autoGrowTextarea(els.input);
      debounceDraft();
    });
    els.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    els.miniExpand?.addEventListener('click', () => toggleExpanded(true));
    els.miniCollapse?.addEventListener('click', () => toggleExpanded(false));
    els.contextSearch?.addEventListener('input', renderContextTree);
    els.contextList?.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-path]');
      if (!cb) return;
      if (cb.checked) state.contextPaths.add(cb.dataset.path);
      else state.contextPaths.delete(cb.dataset.path);
      saveContextSelection();
      updateSubtitle();
    });
    els.contextList?.addEventListener('click', (e) => {
      const caret = e.target.closest('[data-caret]');
      if (!caret) return;
      const row = caret.closest('.feai-tree-item');
      if (row) row.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      const close = e.target.closest('[data-close]');
      if (close) closeModal(close.getAttribute('data-close'));
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePanel();
      }
      if (e.key === 'Escape') {
        if (isContextOpen) closeModal('context');
        else if (isSettingsOpen) closeModal('settings');
        else if (isPanelOpen) closePanel();
      }
    });

    window.addEventListener('beforeunload', () => {
      saveAllSettings();
      saveMessages();
      saveContextSelection();
      saveDraft();
    });
  }

  // ==================== INJECT CSS ====================
  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
            :root{--feai-bg:rgba(18,20,28,0.86);--feai-bg-2:rgba(26,29,40,0.92);--feai-panel:rgba(20,23,33,0.98);--feai-border:rgba(255,255,255,0.10);--feai-text:#e9edf7;--feai-muted:rgba(233,237,247,0.70);--feai-accent:#7c9cff;--feai-accent-2:#8d6bff;--feai-success:#2ecc71;--feai-danger:#ff667a;--feai-warning:#ffbf69;--feai-shadow:0 28px 80px rgba(0,0,0,0.45);--feai-radius:25px 25px 0 0;--feai-radius-lg:22px;--feai-font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
            #feai-root,#feai-root *{box-sizing:border-box}
            #feai-root{position:fixed;right:18px;bottom:0;z-index:2147483647;font-family:var(--feai-font);color:var(--feai-text);pointer-events:none}
            .feai-launcher{pointer-events:auto;position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(145deg,rgba(124,156,255,.96),rgba(141,107,255,.96));color:#fff;box-shadow:0 18px 40px rgba(124,156,255,.35),0 8px 18px rgba(0,0,0,.24);display:grid;place-items:center;cursor:pointer;transform:translateZ(0);transition:transform .18s ease,box-shadow .18s ease;user-select:none}
            .feai-launcher:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 22px 48px rgba(124,156,255,.42),0 10px 22px rgba(0,0,0,.26)}
            .feai-launcher:active{transform:translateY(0) scale(.98)}
            .feai-launcher svg{width:28px;height:28px}
            .feai-panel{pointer-events:auto;position:fixed;right:18px;bottom:0;width:min(50vw,720px);height:min(90vh,900px);max-height:90vh;min-width:360px;background:linear-gradient(180deg,rgba(21,24,34,.98),rgba(14,17,25,.98));border:1px solid var(--feai-border);border-bottom:none;border-radius:var(--feai-radius);box-shadow:var(--feai-shadow);overflow:hidden;display:flex;flex-direction:column;opacity:0;transform:translateY(24px) scale(.98);visibility:hidden;transition:opacity .18s ease,transform .18s ease,visibility .18s ease;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
            .feai-panel.open{opacity:1;transform:translateY(0) scale(1);visibility:visible}
            .feai-header{padding:14px 16px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,0))}
            .feai-brand{display:flex;align-items:center;gap:12px;min-width:0}
            .feai-logo{width:42px;height:42px;border-radius:14px;background:linear-gradient(145deg,rgba(124,156,255,.95),rgba(141,107,255,.95));display:grid;place-items:center;box-shadow:0 10px 24px rgba(124,156,255,.24);flex:0 0 auto}
            .feai-logo svg{width:22px;height:22px;color:#fff}
            .feai-title-wrap{min-width:0}
            .feai-title{font-size:15px;font-weight:800;letter-spacing:.2px;line-height:1.1}
            .feai-subtitle{margin-top:3px;font-size:12px;color:var(--feai-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .feai-header-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
            .feai-icon-btn{width:36px;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:var(--feai-text);display:grid;place-items:center;cursor:pointer;transition:.16s ease}
            .feai-icon-btn:hover{background:rgba(255,255,255,.08);transform:translateY(-1px)}
            .feai-actions{padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
            .feai-chip{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:var(--feai-text);border-radius:999px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:.16s ease;display:inline-flex;align-items:center;gap:8px;user-select:none}
            .feai-chip:hover{background:rgba(255,255,255,.08);transform:translateY(-1px)}
            .feai-chip.primary{background:linear-gradient(145deg,rgba(124,156,255,.96),rgba(141,107,255,.96));border-color:transparent}
            .feai-chip.danger{background:rgba(255,102,122,.13);border-color:rgba(255,102,122,.18)}
            .feai-chip.success{background:rgba(46,204,113,.13);border-color:rgba(46,204,113,.18)}
            .feai-body{flex:1;display:flex;flex-direction:column;min-height:0;background:radial-gradient(circle at top,rgba(124,156,255,.06),transparent 38%),linear-gradient(180deg,rgba(255,255,255,.02),transparent 18%)}
            .feai-status{padding:10px 14px 0;display:flex;justify-content:space-between;gap:8px;color:var(--feai-muted);font-size:12px}
            .feai-context-summary{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
            .feai-pill{padding:5px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);font-weight:700;font-size:11px;color:var(--feai-text)}
            .feai-messages{flex:1;overflow:auto;padding:14px 14px 12px;display:flex;flex-direction:column;gap:10px;min-height:0;scroll-behavior:smooth}
            .feai-messages::-webkit-scrollbar,.feai-context-list::-webkit-scrollbar{width:10px}
            .feai-messages::-webkit-scrollbar-thumb,.feai-context-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.10);border-radius:999px;border:2px solid transparent;background-clip:content-box}
            .feai-msg{width:fit-content;max-width:min(92%,640px);padding:12px 14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 28px rgba(0,0,0,.10);white-space:pre-wrap;word-break:break-word;line-height:1.55;font-size:13.5px}
            .feai-msg.user{margin-left:auto;background:linear-gradient(145deg,rgba(124,156,255,.20),rgba(141,107,255,.18));border-color:rgba(124,156,255,.22)}
            .feai-msg.ai{margin-right:auto;background:rgba(255,255,255,.04)}
            .feai-msg.system{margin:0 auto;background:rgba(255,255,255,.03);color:var(--feai-muted);font-size:12px}
            .feai-msg .meta{margin-top:8px;font-size:11px;color:rgba(233,237,247,.60)}
            .feai-typing{display:inline-flex;align-items:center;gap:6px;color:var(--feai-muted);font-size:12px}
            .feai-dots{display:inline-flex;gap:4px}
            .feai-dots span{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.45;animation:feai-bounce 1.1s infinite ease-in-out}
            .feai-dots span:nth-child(2){animation-delay:.14s}
            .feai-dots span:nth-child(3){animation-delay:.28s}
            @keyframes feai-bounce{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-5px);opacity:.95}}
            .feai-input-wrap{padding:12px 12px 14px;border-top:1px solid rgba(255,255,255,.08);background:rgba(10,12,18,.62);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
            .feai-input-bar{display:flex;gap:10px;align-items:flex-end}
            .feai-textarea{flex:1;min-height:50px;max-height:180px;resize:none;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:var(--feai-text);padding:13px 14px;outline:none;font:inherit;line-height:1.5;overflow-y:auto}
            .feai-textarea::placeholder{color:rgba(233,237,247,.45)}
            .feai-send{width:50px;height:50px;border:none;border-radius:16px;background:linear-gradient(145deg,rgba(124,156,255,.96),rgba(141,107,255,.96));color:#fff;cursor:pointer;box-shadow:0 12px 28px rgba(124,156,255,.28);display:grid;place-items:center;transition:transform .16s ease,filter .16s ease;flex:0 0 auto}
            .feai-send:hover{transform:translateY(-1px);filter:brightness(1.03)}
            .feai-send:active{transform:translateY(0) scale(.98)}
            .feai-send svg{width:20px;height:20px}
            .feai-helper-row{margin-top:10px;display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:11.5px;color:var(--feai-muted)}
            .feai-mini-actions{display:flex;flex-wrap:wrap;gap:6px}
            .feai-mini-btn{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:var(--feai-text);border-radius:999px;padding:6px 9px;cursor:pointer;font-size:11px;transition:.16s ease}
            .feai-mini-btn:hover{background:rgba(255,255,255,.08)}
            .feai-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:2147483646}
            .feai-backdrop.open{opacity:1;pointer-events:auto}
            .feai-modal{position:fixed;right:18px;bottom:86px;width:min(50vw,720px);max-width:calc(100vw - 36px);max-height:85vh;border-radius:22px;background:linear-gradient(180deg,rgba(23,27,38,.98),rgba(14,17,25,.98));border:1px solid var(--feai-border);box-shadow:var(--feai-shadow);overflow:hidden;z-index:2147483648;display:none;flex-direction:column;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
            .feai-modal.open{display:flex}
            .feai-modal-head{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;gap:12px}
            .feai-modal-title{font-size:14px;font-weight:800}
            .feai-modal-close{width:36px;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:var(--feai-text);cursor:pointer}
            .feai-modal-body{padding:14px 16px 16px;overflow:auto;max-height:60vh}
            .feai-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
            .feai-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
            .feai-label{font-size:12px;color:var(--feai-muted);font-weight:700}
            .feai-input,.feai-select,.feai-textarea-small{width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:var(--feai-text);padding:11px 12px;outline:none;font:inherit}
            .feai-textarea-small{min-height:88px;resize:vertical}
            .feai-note{font-size:11px;color:var(--feai-muted);line-height:1.5}
            .feai-row{display:flex;gap:10px;flex-wrap:wrap}
            .feai-switches{display:flex;flex-wrap:wrap;gap:8px}
            .feai-toggle{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--feai-text);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);padding:9px 11px;border-radius:999px;cursor:pointer}
            .feai-toggle input{accent-color:var(--feai-accent)}
            .feai-footer-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
            .feai-context-list{max-height:52vh;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:10px;background:rgba(255,255,255,.03)}
            .feai-tree{list-style:none;margin:0;padding:0}
            .feai-tree-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:12px;transition:.15s ease}
            .feai-tree-item:hover{background:rgba(255,255,255,.05)}
            .feai-tree-item .label{flex:1;min-width:0;display:flex;flex-direction:column}
            .feai-tree-item .path{font-size:11px;color:var(--feai-muted);word-break:break-all}
            .feai-tree-item .name{font-size:12.5px;font-weight:700;word-break:break-all}
            .feai-tree-item.folder{background:rgba(124,156,255,.04)}
            .feai-checked{accent-color:var(--feai-accent);width:16px;height:16px;cursor:pointer}
            .feai-caret{width:22px;height:22px;display:grid;place-items:center;border-radius:8px;background:rgba(255,255,255,.04);color:var(--feai-muted);flex:0 0 auto;cursor:pointer;user-select:none}
            .feai-tree-children{list-style:none;margin:0;padding:0 0 0 18px;display:none}
            .feai-tree-item.open+.feai-tree-children{display:block}
            .feai-file-upload{display:none}
            .feai-badge{font-size:10px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);color:var(--feai-muted);font-weight:700}
            .feai-empty{padding:18px 12px;text-align:center;color:var(--feai-muted);font-size:12px}
            @media(max-width:1100px){.feai-panel,.feai-modal{width:min(94vw,720px)}}
            @media(max-width:640px){#feai-root{right:0}.feai-panel,.feai-modal{right:0;left:0;bottom:74px;width:100vw;min-width:0;border-radius:22px 22px 0 0}.feai-launcher{right:14px;bottom:14px}.feai-grid{grid-template-columns:1fr}}
          `;
    document.head.appendChild(style);
  }

  // ==================== INIT ====================
  async function init() {
    // Cegah inisialisasi ganda
    if (document.getElementById('feai-root')) {
      console.warn('[ForgeEditAI] Widget sudah ada di halaman.');
      return;
    }

    injectCSS();
    createDOM();
    cacheElements();

    loadSettings();
    loadMessages();
    loadContextSelection();
    const savedUploads = loadJSON('uploads', []);
    state.uploadFiles = Array.isArray(savedUploads) ? savedUploads : [];
    const savedUI = loadJSON('ui', null);
    if (savedUI && typeof savedUI === 'object') state.ui.panelExpanded = !!savedUI.expanded;

    try {
      db = await openDB();
      await refreshContextTree();
    } catch (e) {
      console.warn('[ForgeEditAI] IndexedDB tidak tersedia, context tree terbatas.');
      db = null;
    }

    syncSettingsInputs();
    updateSubtitle();
    renderMessages();
    loadDraft();
    applyExpandedState();
    bindEvents();

    if (state.settings.autoOpen) openPanel();

    // Expose API global
    window.ForgeEditAI = {
      open: openPanel,
      close: closePanel,
      toggle: togglePanel,
      addMessage,
      addToContext(path, name, type = 'file') {
        const normalized = normalizePath(path);
        if (!contextTree.children.has(name)) {
          contextTree.children.set(name, {
            name,
            path: normalized,
            type,
            parent: '/',
            children: new Map(),
            depth: 1
          });
        }
        state.contextPaths.add(normalized);
        saveContextSelection();
        updateSubtitle();
        renderContextTree();
      },
      setSettings(next) {
        Object.assign(state.settings, next || {});
        state.settings.ttlHours = clampTTL(state.settings.ttlHours);
        syncSettingsInputs();
        saveAllSettings();
        updateSubtitle();
      },
      getState() {
        return {
          settings: {
            ...state.settings
          },
          messages: state.messages.slice(),
          contextPaths: Array.from(state.contextPaths),
          uploads: state.uploadFiles.slice()
        };
      },
      clearAll,
      refreshContext: refreshContextTree,
      version: '2.0.0'
    };

    console.log(
      '%c⚡ ForgeEdit AI Widget v2.0 siap%c\n%cTekan Ctrl+K atau klik tombol chat di pojok kanan bawah.',
      'color:#7c9cff;font-weight:bold;', '', 'color:#8b8fa0;');
  }

  // Jalankan saat DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
