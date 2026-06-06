/**
 * ForgeEdit AI Widget Fusion v4.0
 *
 * @license MIT
 */
(function () {
  'use strict';

  // ===========================================================================
  // KONFIGURASI GLOBAL
  // ===========================================================================
  const CONFIG = {
    APP_KEY: 'forgeedit_ai_fusion',
    DB_NAME: 'ForgeEditDB',
    DB_VERSION: 3,
    STORE_FILES: 'files',
    DEFAULT_TTL_HOURS: 24,
    MAX_TTL_HOURS: 336, // 14 hari * 24 jam
    PROVIDERS: {
      gemini: {
        name: 'Gemini',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{{model}}:streamGenerateContent?alt=sse&key={{key}}',
        defaultModel: 'gemini-2.0-flash',
        transform: (model, key, messages, system, context) => {
          const contents = [];
          if (system) contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${system}` }] });
          if (context) contents.push({ role: 'user', parts: [{ text: `[CONTEXT]\n${context}` }] });
          messages.forEach(m => contents.push({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.content }] }));
          return { contents };
        },
        parseChunk: (dataStr) => {
          try {
            const data = JSON.parse(dataStr);
            return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
          } catch { return null; }
        }
      },
      groq: {
        name: 'Groq',
        defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        transform: (model, key, messages, system, context) => {
          const msgs = [];
          if (system) msgs.push({ role: 'system', content: system });
          if (context) msgs.push({ role: 'system', content: `[CONTEXT]\n${context}` });
          messages.forEach(m => msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
          return { model, messages: msgs, stream: true };
        },
        parseChunk: (dataStr) => {
          try {
            const data = JSON.parse(dataStr);
            return data.choices?.[0]?.delta?.content || null;
          } catch { return null; }
        }
      },
      openrouter: {
        name: 'OpenRouter',
        defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'google/gemini-2.0-flash-001',
        transform: (model, key, messages, system, context) => {
          const msgs = [];
          if (system) msgs.push({ role: 'system', content: system });
          if (context) msgs.push({ role: 'system', content: `[CONTEXT]\n${context}` });
          messages.forEach(m => msgs.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
          return { model, messages: msgs, stream: true };
        },
        parseChunk: (dataStr) => {
          try {
            const data = JSON.parse(dataStr);
            return data.choices?.[0]?.delta?.content || null;
          } catch { return null; }
        }
      }
    }
  };

  // ===========================================================================
  // UTILITAS
  // ===========================================================================
  const Utils = {
    now: () => Date.now(),
    clampTTL: (h) => Math.max(1, Math.min(CONFIG.MAX_TTL_HOURS, Number(h) || CONFIG.DEFAULT_TTL_HOURS)),
    safeText: (v) => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    storageKey: (name) => `${CONFIG.APP_KEY}:${name}`,
    renderMarkdown: (text) => {
      if (!text) return '';
      let html = Utils.safeText(text);
      html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (_, lang, code) => `
        <div class="feai-code-wrap">
          <div class="feai-code-header"><span>${lang || 'code'}</span><button class="feai-code-copy" onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`')}\`)">Copy</button></div>
          <pre class="feai-code-block"><code>${code}</code></pre>
        </div>`);
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.split('\n\n').map(p => p.startsWith('<') ? p : `<p>${p}</p>`).join('');
      return html;
    }
  };

  // ===========================================================================
  // LOCAL STORAGE MANAGER (dengan TTL)
  // ===========================================================================
  class LocalStore {
    static load(key, fallback = null) {
      try {
        const raw = localStorage.getItem(Utils.storageKey(key));
        if (!raw) return fallback;
        const { value, expiresAt } = JSON.parse(raw);
        if (typeof expiresAt === 'number' && expiresAt < Utils.now()) {
          localStorage.removeItem(Utils.storageKey(key));
          return fallback;
        }
        return value ?? fallback;
      } catch { return fallback; }
    }

    static save(key, value, ttlHours) {
      const ttl = Utils.clampTTL(ttlHours ?? CONFIG.DEFAULT_TTL_HOURS);
      const payload = {
        value,
        savedAt: Utils.now(),
        expiresAt: Utils.now() + ttl * 60 * 60 * 1000
      };
      try { localStorage.setItem(Utils.storageKey(key), JSON.stringify(payload)); } catch (e) { console.warn('[ForgeEditAI] localStorage penuh:', e.message); }
    }

    static remove(key) {
      localStorage.removeItem(Utils.storageKey(key));
    }
  }

  // ===========================================================================
  // INDEXEDDB ADAPTER (khusus file editor)
  // ===========================================================================
class ForgeEditDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      // Gunakan versi yang sama dengan script.js untuk menghindari konflik
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Pastikan semua store yang diperlukan ada
        if (!db.objectStoreNames.contains('files')) {
          const s = db.createObjectStore('files', { keyPath: 'path' });
          s.createIndex('parent', 'parent', { unique: false });
          s.createIndex('type', 'type', { unique: false });
          s.createIndex('modified', 'modified', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('snippets')) {
          db.createObjectStore('snippets', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { 
        this.db = e.target.result; 
        console.log('[ForgeEdit AI] Database connected');
        resolve(); 
      };
      req.onerror = (e) => {
        console.error('[ForgeEdit AI] Database error:', e.target.error);
        reject(e.target.error);
      };
      req.onblocked = () => {
        console.warn('[ForgeEdit AI] Database blocked by another tab. Waiting...');
        // Jangan reject, biarkan retry otomatis saat tab lain ditutup
        setTimeout(() => {
          if (this.db) {
            resolve();
          } else {
            // Retry lagi setelah beberapa detik
            this.init().then(resolve).catch(reject);
          }
        }, 3000);
      };
    });
  }

  async get(storeName, key) {
    return this._tx(storeName, 'readonly', s => s.get(key));
  }

  async put(storeName, data) {
    return this._tx(storeName, 'readwrite', s => s.put(data));
  }

  async getAll(storeName) {
    return this._tx(storeName, 'readonly', s => s.getAll());
  }

  _tx(store, mode, cb) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const objStore = tx.objectStore(store);
      const req = cb(objStore);
      tx.oncomplete = () => resolve(req ? req.result : null);
      tx.onerror = () => reject(tx.error);
    });
  }
}

  // ===========================================================================
  // STATE MANAGEMENT (Reactive Store)
  // ===========================================================================
  class Store {
    constructor() {
      this.state = {
        messages: [],
        contextPaths: new Set(),
        uploadFiles: [],
        settings: {
          provider: 'gemini',
          apiKey: '',
          model: 'gemini-2.0-flash',
          endpoint: '',
          systemPrompt: 'You are a helpful AI coding assistant.',
          ttlHours: CONFIG.DEFAULT_TTL_HOURS,
          stream: true,
          rememberUI: true,
          autoOpen: false,
          useContext: true
        },
        ui: {
          panelOpen: false,
          activeModal: null, // 'settings' | 'context' | null
          expandedFolders: new Set(),
          searchQuery: '',
          panelExpanded: false,
          backdropVisible: false
        }
      };
      this.listeners = new Set();
    }

    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _notify() { this.listeners.forEach(fn => fn(this.state)); }

    setSettings(partial) { Object.assign(this.state.settings, partial); this._notify(); }
    setUI(partial) { Object.assign(this.state.ui, partial); this._notify(); }

    addMessage(role, content) {
      this.state.messages.push({ id: crypto.randomUUID(), role, content, ts: Utils.now() });
      this._notify();
    }

    updateLastMessage(content) {
      const last = this.state.messages[this.state.messages.length - 1];
      if (last && last.role === 'ai') { last.content = content; this._notify(); }
    }

    toggleFolder(path) {
      const expanded = this.state.ui.expandedFolders;
      if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
      this._notify();
    }

    setContext(paths) {
      this.state.contextPaths = new Set(paths);
      this._notify();
    }

    addUpload(file) {
      this.state.uploadFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });
      this._notify();
    }

    clearUploads() { this.state.uploadFiles = []; this._notify(); }
    clearHistory() { this.state.messages = []; this._notify(); }
    resetApi() {
      this.state.settings.apiKey = '';
      this.state.settings.endpoint = '';
      this.state.settings.model = '';
      this.state.settings.provider = '';
      this._notify();
    }
    clearAll() {
      this.clearHistory();
      this.resetApi();
      this.state.contextPaths.clear();
      this.clearUploads();
      this._notify();
    }
  }

  // ===========================================================================
  // PROVIDER FACTORY
  // ===========================================================================
  const ProviderFactory = {
    get(type) {
      const base = {
        getHeaders: (key) => ({ 'Content-Type': 'application/json' })
      };
      const prov = CONFIG.PROVIDERS[type];
      if (!prov) throw new Error(`Provider ${type} tidak dikenal`);
      return {
        name: prov.name,
        defaultModel: prov.defaultModel,
        defaultEndpoint: prov.defaultEndpoint,
        transform: (model, key, messages, system, context) => prov.transform(model, key, messages, system, context),
        parseChunk: (dataStr) => prov.parseChunk(dataStr),
        getHeaders: (key) => {
          const headers = { ...base.getHeaders() };
          if (type === 'groq' || type === 'openrouter') headers['Authorization'] = `Bearer ${key}`;
          if (type === 'openrouter') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'ForgeEdit AI';
          }
          return headers;
        }
      };
    }
  };

  // ===========================================================================
  // UI LAYER
  // ===========================================================================
  class UI {
    constructor(store, db) {
      this.store = store;
      this.db = db;
      this.els = {};
    }

    init() {
      this.injectCSS();
      this.createDOM();
      this.cacheElements();
      this.bindEvents();
      this.store.subscribe(() => this.render());
      this.render();
    }

    injectCSS() {
      const style = document.createElement('style');
      style.textContent = `
        :root {
        :root {
          --feai-bg: #0d1117;
          --feai-bg2: #232b3c;
          --feai-panel: rgba(13, 17, 23, 0.96);
          --feai-border: rgba(255, 255, 255, 0.08);
          --feai-text: #e6edf3;
          --feai-muted: rgba(230, 237, 243, 0.6);
          --feai-accent: #58a6ff;
          --feai-accent2: #79c0ff;
          --feai-danger: #f85149;
          --feai-success: #3fb950;
          --feai-warning: #d2991d;
          --feai-gradient: linear-gradient(135deg, #1f6feb, #58a6ff);
          --feai-shadow: 0 8px 24px rgba(0,0,0,0.4);
          --feai-shadow-up: 0 -24px 24px rgba(0,0,0,0.4);
          --feai-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        }
        #feai-root { position: fixed; right: 0; bottom: 0; z-index: 4000000; font-family: var(--feai-font); color: var(--feai-text); pointer-events: none; }
        .feai-launcher { pointer-events: auto; position: fixed; right: 0; bottom: 90px; width: 52px; height: 52px; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px 0 0 20px; background: var(--feai-gradient); color: #fff; cursor: pointer; box-shadow: var(--feai-shadow); display: grid; place-items: center; transition: all 0.2s ease; z-index: 5000000; }
        .feai-launcher:hover { transform: scale(1.05); filter: brightness(1.1); }
        .feai-panel { pointer-events: auto; position: fixed; right: 0; bottom: 0; width: min(50vw, 780px); height: 90dvh; max-height: 90dvh; background: var(--feai-panel); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--feai-border); border-bottom: none; border-radius: 25px 25px 0 0; box-shadow: var(--feai-shadow); display: flex; flex-direction: column; opacity: 0; transform: translateY(30px); visibility: hidden; transition: all 0.25s cubic-bezier(0.4,0,0.2,1); z-index: 5000010; }
        .feai-panel.open { opacity: 1; transform: translateY(0); visibility: visible; }
        .feai-header { padding: 16px 20px; display: flex; flex-direction: column; border-bottom: 1px solid var(--feai-border); background: rgba(255,255,255,0.02); gap: 10px; }
        .feai-brand { display: flex; align-items: center; gap: 12px; margin-left: 0; padding-left: 0; }
        .feai-logo { width: 38px; height: 38px; border-radius: 12px; background: var(--feai-gradient); display: grid; place-items: center; box-shadow: 0 0 12px rgba(88,166,255,0.3); }
        .feai-logo svg { width: 20px; height: 20px; color: #fff; }
        .feai-title { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
        .feai-subtitle { font-size: 12px; color: var(--feai-muted); margin-top: 2px; }
        .feai-header-actions { display: flex; margin: auto; gap: 6px; margin-right: 0; padding-right: 0; }
        .feai-icon-btn { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.15); border: 1px solid var(--feai-border); color: var(--feai-text); cursor: pointer; display: grid; place-items: center; transition: all 0.15s;  box-shadow: var(--feai-shadow); }
        .feai-icon-btn:hover { background: rgba(255,255,255,0.1); }
        .feai-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--feai-bg2); }
        .feai-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .feai-msg { max-width: 85%; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; animation: feaiFadeIn 0.25s ease; margin-bottom: 20px; }
        @keyframes feaiFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .feai-msg.user { align-self: flex-end; background: #333f58; box-shadow: var(--feai-shadow); border-bottom-right-radius: 0; }
        .feai-msg.ai { align-self: flex-start; background: #495458; box-shadow: var(--feai-shadow); border-bottom-left-radius: 0; }
        .feai-msg.system { align-self: center; background: transparent; color: var(--feai-muted); font-size: 12px; border: none; }
        .feai-code-wrap { background: #161b22; border-radius: 10px; margin: 8px 0; border: 1px solid var(--feai-border); overflow: hidden; }
        .feai-code-header { display: flex; justify-content: space-between; padding: 6px 12px; background: rgba(255,255,255,0.04); font-size: 11px; color: var(--feai-muted); }
        .feai-code-copy { background: none; border: none; color: var(--feai-accent); cursor: pointer; font-weight: 600; }
        .feai-code-block { margin: 0; padding: 12px; overflow-x: auto; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: #c9d1d9; }
        .feai-input-wrap { padding: 16px 20px 20px; background: rgba(0,0,0,0.3); border-top: 1px solid var(--feai-border); }
        .feai-input-bar { display: flex; gap: 10px; align-items: flex-end; }
        .feai-textarea { flex: 1; min-height: 52px; max-height: 180px; resize: none; border-radius: 16px; background: rgba(255,255,255,0.05); border: 1px solid var(--feai-border); color: var(--feai-text); padding: 12px 14px; outline: none; font: inherit; }
        .feai-send { width: 48px; height: 48px; border: none; border-radius: 14px; background: var(--feai-gradient); color: #fff; cursor: pointer; box-shadow: 0 4px 12px rgba(31,111,235,0.3); display: grid; place-items: center; transition: all 0.15s; }
        .feai-send:hover { filter: brightness(1.1); }
        .feai-send svg { width: 20px; height: 20px; }
        .feai-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.3); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 4500000; }
        .feai-backdrop.active { opacity: 1; pointer-events: auto; }
        .feai-modal { position: fixed; right: 0; bottom: 0; width: min(50vw, 700px); max-height: 85dvh; background: var(--feai-panel); backdrop-filter: blur(24px); border: 1px solid var(--feai-border); border-radius: 20px 20px 0 0; box-shadow: var(--feai-shadow-up); z-index: 5000030 !important; display: flex; flex-direction: column; opacity: 0; transform: translateY(30px); pointer-events: none; transition: opacity 0.2s, transform 0.2s; }
        .feai-modal.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
        .feai-modal-header { padding: 14px 20px; border-bottom: 1px solid var(--feai-border); display: flex; justify-content: space-between; align-items: center; }
        .feai-modal-body { padding: 20px; overflow-y: auto; flex: 1; }
        .feai-field { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
        .feai-label { font-size: 12px; font-weight: 600; color: var(--feai-muted); text-transform: uppercase; letter-spacing: 0.3px; }
        .feai-input, .feai-select { background: rgba(255,255,255,0.05); border: 1px solid var(--feai-border); border-radius: 10px; color: var(--feai-text); padding: 10px 12px; outline: none; font: inherit; }
        .feai-select option { background: #0d1117; }
        .feai-btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.15s; }
        .feai-btn-primary { background: var(--feai-gradient); color: #fff; }
        .feai-btn-danger { background: rgba(248,81,73,0.15); border: 1px solid var(--feai-danger); color: var(--feai-danger); }
        .feai-btn-success { background: rgba(63,185,80,0.15); border: 1px solid var(--feai-success); color: var(--feai-success); }
        .feai-tree { list-style: none; padding: 0; margin: 0; }
        .feai-tree-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; font-size: 13px; }
        .feai-tree-item:hover { background: rgba(255,255,255,0.04); }
        .feai-caret { width: 18px; text-align: center; transition: transform 0.15s; }
        .feai-caret.open { transform: rotate(90deg); }
        .feai-checkbox { accent-color: var(--feai-accent); }
        .feai-context-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
      `;
      document.head.appendChild(style);
    }

    createDOM() {
      const root = document.createElement('div');
      root.id = 'feai-root';
      root.innerHTML = `
      <div class="feai-backdrop" id="feai-backdrop"></div>
        <button class="feai-launcher" id="feai-launcher" title="ForgeEdit AI (Ctrl+K)">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="M19.094 5.332c1.294 1.366 1.837 3.231 2.067 5.846.608 0 1.175.134 1.558.656l.715.97c.206.278.316.612.316.958v2.634c0 .34-.17.672-.444.872-3.238 2.372-7.235 4.279-11.306 4.279-4.504 0-9.013-2.595-11.306-4.279a1.1 1.1 0 0 1-.444-.872v-2.634c0-.346.11-.681.314-.96l.716-.968c.383-.52.952-.656 1.56-.656.229-2.615.77-4.48 2.066-5.846 2.443-2.588 5.677-2.873 7.053-2.879H12c1.351 0 4.627.265 7.094 2.879M12.001 9.68c-.279 0-.6.016-.942.05-.12.45-.299.854-.558 1.113-1.029 1.028-2.268 1.187-2.932 1.187-.624 0-1.279-.13-1.812-.467-.506.166-.99.405-1.023 1.001-.054 1.128-.058 2.254-.063 3.38q-.002.849-.013 1.698a.86.86 0 0 0 .5.77c2.43 1.107 4.729 1.665 6.844 1.665 2.112 0 4.41-.558 6.84-1.666a.86.86 0 0 0 .499-.77c.03-1.69.006-3.388-.075-5.077h.002c-.032-.6-.519-.835-1.026-1.002-.534.336-1.186.468-1.81.468-.664 0-1.903-.159-2.932-1.187-.26-.259-.438-.664-.558-1.113a10 10 0 0 0-.94-.05Zm-2.473 4.033c.528 0 .956.427.956.955v1.761a.955.955 0 1 1-1.911 0v-1.761c0-.528.428-.955.955-.955m4.896 0c.528 0 .956.427.956.955v1.761a.956.956 0 0 1-1.911 0v-1.761c0-.528.427-.955.955-.955m-6.698-8.66c-1.028.102-1.895.44-2.335.91-.955 1.043-.75 3.687-.206 4.245.397.397 1.146.661 1.953.661.617 0 1.792-.132 2.762-1.116.425-.412.69-1.44.66-2.483-.029-.837-.264-1.527-.616-1.82-.382-.339-1.249-.486-2.218-.397m6.33.396c-.352.294-.587.984-.617 1.822-.029 1.042.235 2.07.661 2.482.97.984 2.145 1.116 2.762 1.116.807 0 1.556-.264 1.953-.66.543-.559.749-3.203-.206-4.245-.44-.47-1.307-.808-2.335-.911-.97-.088-1.836.059-2.218.397ZM12 7.594c-.235 0-.514.014-.822.044.029.161.044.338.058.529 0 .132 0 .264-.015.41.294-.029.544-.029.779-.029s.485 0 .778.03c-.014-.147-.014-.28-.014-.411a5 5 0 0 1 .058-.53A9 9 0 0 0 12 7.595Z"/></svg>
        </button>
        <section class="feai-panel" id="feai-panel">
          <header class="feai-header">
            <div class="feai-brand">
              <div class="feai-logo"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="M19.094 5.332c1.294 1.366 1.837 3.231 2.067 5.846.608 0 1.175.134 1.558.656l.715.97c.206.278.316.612.316.958v2.634c0 .34-.17.672-.444.872-3.238 2.372-7.235 4.279-11.306 4.279-4.504 0-9.013-2.595-11.306-4.279a1.1 1.1 0 0 1-.444-.872v-2.634c0-.346.11-.681.314-.96l.716-.968c.383-.52.952-.656 1.56-.656.229-2.615.77-4.48 2.066-5.846 2.443-2.588 5.677-2.873 7.053-2.879H12c1.351 0 4.627.265 7.094 2.879M12.001 9.68c-.279 0-.6.016-.942.05-.12.45-.299.854-.558 1.113-1.029 1.028-2.268 1.187-2.932 1.187-.624 0-1.279-.13-1.812-.467-.506.166-.99.405-1.023 1.001-.054 1.128-.058 2.254-.063 3.38q-.002.849-.013 1.698a.86.86 0 0 0 .5.77c2.43 1.107 4.729 1.665 6.844 1.665 2.112 0 4.41-.558 6.84-1.666a.86.86 0 0 0 .499-.77c.03-1.69.006-3.388-.075-5.077h.002c-.032-.6-.519-.835-1.026-1.002-.534.336-1.186.468-1.81.468-.664 0-1.903-.159-2.932-1.187-.26-.259-.438-.664-.558-1.113a10 10 0 0 0-.94-.05Zm-2.473 4.033c.528 0 .956.427.956.955v1.761a.955.955 0 1 1-1.911 0v-1.761c0-.528.428-.955.955-.955m4.896 0c.528 0 .956.427.956.955v1.761a.956.956 0 0 1-1.911 0v-1.761c0-.528.427-.955.955-.955m-6.698-8.66c-1.028.102-1.895.44-2.335.91-.955 1.043-.75 3.687-.206 4.245.397.397 1.146.661 1.953.661.617 0 1.792-.132 2.762-1.116.425-.412.69-1.44.66-2.483-.029-.837-.264-1.527-.616-1.82-.382-.339-1.249-.486-2.218-.397m6.33.396c-.352.294-.587.984-.617 1.822-.029 1.042.235 2.07.661 2.482.97.984 2.145 1.116 2.762 1.116.807 0 1.556-.264 1.953-.66.543-.559.749-3.203-.206-4.245-.44-.47-1.307-.808-2.335-.911-.97-.088-1.836.059-2.218.397ZM12 7.594c-.235 0-.514.014-.822.044.029.161.044.338.058.529 0 .132 0 .264-.015.41.294-.029.544-.029.779-.029s.485 0 .778.03c-.014-.147-.014-.28-.014-.411a5 5 0 0 1 .058-.53A9 9 0 0 0 12 7.595Z"/></svg></div>
              <div>
                <div class="feai-title">ForgeEdit AI</div>
                <div class="feai-subtitle" id="feai-subtitle">Gemini · gemini-2.0-flash · 0 files</div>
              </div>
            </div>
            <div class="feai-header-actions">
              <button class="feai-icon-btn" id="feai-btn-context" title="Context"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M16 2v5h5"/><path d="M21 6v6.5c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5v-9c0-.8.7-1.5 1.5-1.5H17l4 4z"/><path d="M7 8v8.8c0 .3.2.6.4.8c.2.2.5.4.8.4H15"/><path d="M3 12v8.8c0 .3.2.6.4.8c.2.2.5.4.8.4H11"/></g></svg></button>
              <button class="feai-icon-btn" id="feai-btn-upload" title="Upload files"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M12 12v9"/><path d="m16 16l-4-4l-4 4"/></g></svg></button>
              <button class="feai-icon-btn" id="feai-btn-settings" title="Settings"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="6" height="14" x="4" y="5" rx="2"/><rect width="6" height="10" x="14" y="7" rx="2"/><path d="M17 22v-5m0-10V2M7 22v-3M7 5V2"/></g></svg></button>
              <button class="feai-icon-btn" id="feai-btn-close" title="Close"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
          </header>
          <div class="feai-body">
            <div class="feai-messages" id="feai-messages"></div>
            <div class="feai-input-wrap">
              <div class="feai-input-bar">
                <textarea class="feai-textarea" id="feai-input" placeholder="Ask anything... (Enter to send)" rows="1"></textarea>
                <button class="feai-send" id="feai-send"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button>
              </div>
            </div>
          </div>
        </section>
        <!-- Settings Modal -->
        <div class="feai-modal" id="feai-modal-settings">
          <div class="feai-modal-header"><span style="font-weight:700;">AI Settings</span><button class="feai-icon-btn" id="feai-modal-close-settings"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg></button></div>
          <div class="feai-modal-body">
            <div class="feai-field"><label class="feai-label">Provider</label><select class="feai-select" id="set-provider"><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></div>
            <div class="feai-field"><label class="feai-label">API Key</label><input type="password" class="feai-input" id="set-key" placeholder="Your API key"></div>
            <div class="feai-field"><label class="feai-label">Model</label><input type="text" class="feai-input" id="set-model" placeholder="Model name"></div>
            <div class="feai-field"><label class="feai-label">Endpoint (optional)</label><input type="text" class="feai-input" id="set-endpoint" placeholder="Custom endpoint"></div>
            <div class="feai-field"><label class="feai-label">System Prompt</label><textarea class="feai-input" id="set-prompt" rows="2"></textarea></div>
            <div class="feai-field"><label class="feai-label">Session TTL (hours)</label><select class="feai-select" id="set-ttl">
              <option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="96">96 hours</option><option value="120">120 hours</option><option value="144">144 hours</option><option value="168">7 days</option><option value="336">14 days (max)</option>
            </select></div>
            <div class="feai-field">
              <label class="feai-label">Options</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="set-stream" checked> Stream responses</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="set-remember-ui" checked> Remember UI state</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="set-auto-open"> Auto open</label>
              <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="set-use-context" checked> Use context</label>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
              <button class="feai-btn feai-btn-danger" id="set-reset-api">Reset API</button>
              <button class="feai-btn feai-btn-danger" id="set-reset-history">Reset History</button>
              <button class="feai-btn feai-btn-success" id="set-clear-all">Clear All</button>
              <button class="feai-btn feai-btn-primary" id="set-save">Save Changes</button>
            </div>
          </div>
        </div>
        <!-- Context Modal -->
        <div class="feai-modal" id="feai-modal-context">
          <div class="feai-modal-header"><span style="font-weight:700;">Context Selection</span><button class="feai-icon-btn" id="feai-modal-close-context"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg></button></div>
          <div class="feai-modal-body">
            <div class="feai-field"><input type="text" class="feai-input" id="ctx-search" placeholder="Search files..."></div>
            <div id="ctx-tree-container" style="max-height: 50vh; overflow-y: auto;"></div>
            <div class="feai-context-actions">
              <button class="feai-btn" id="ctx-select-all" style="background:rgba(255,255,255,0.05); border:1px solid var(--feai-border); color:var(--feai-text);">Select All</button>
              <button class="feai-btn" id="ctx-clear" style="background:rgba(255,255,255,0.05); border:1px solid var(--feai-border); color:var(--feai-text);">Clear</button>
              <button class="feai-btn feai-btn-primary" id="ctx-apply">Apply</button>
            </div>
          </div>
        </div>
        <input type="file" id="feai-file-upload" multiple style="display:none;">
      `;
      document.body.appendChild(root);
    }

    cacheElements() {
      const g = (id) => document.getElementById(id);
      this.els = {
        backdrop: g('feai-backdrop'),
        launcher: g('feai-launcher'),
        panel: g('feai-panel'),
        subtitle: g('feai-subtitle'),
        messages: g('feai-messages'),
        input: g('feai-input'),
        send: g('feai-send'),
        btnSettings: g('feai-btn-settings'),
        btnContext: g('feai-btn-context'),
        btnUpload: g('feai-btn-upload'),
        btnClose: g('feai-btn-close'),
        modalSettings: g('feai-modal-settings'),
        modalContext: g('feai-modal-context'),
        setProvider: g('set-provider'),
        setKey: g('set-key'),
        setModel: g('set-model'),
        setEndpoint: g('set-endpoint'),
        setPrompt: g('set-prompt'),
        setTTL: g('set-ttl'),
        setStream: g('set-stream'),
        setRememberUI: g('set-remember-ui'),
        setAutoOpen: g('set-auto-open'),
        setUseContext: g('set-use-context'),
        setSave: g('set-save'),
        setResetApi: g('set-reset-api'),
        setResetHistory: g('set-reset-history'),
        setClearAll: g('set-clear-all'),
        ctxSearch: g('ctx-search'),
        ctxTree: g('ctx-tree-container'),
        ctxSelectAll: g('ctx-select-all'),
        ctxClear: g('ctx-clear'),
        ctxApply: g('ctx-apply'),
        fileUpload: g('feai-file-upload'),
        closeSettings: g('feai-modal-close-settings'),
        closeContext: g('feai-modal-close-context')
      };
    }

    bindEvents() {
      const { store } = this;
      // Launcher & panel
      this.els.launcher.addEventListener('click', () => store.setUI({ panelOpen: !store.state.ui.panelOpen }));
      this.els.btnClose.addEventListener('click', () => store.setUI({ panelOpen: false }));
      // Modals
      this.els.btnSettings.addEventListener('click', () => store.setUI({ activeModal: 'settings' }));
      this.els.btnContext.addEventListener('click', () => store.setUI({ activeModal: 'context' }));
      this.els.closeSettings.addEventListener('click', () => store.setUI({ activeModal: null }));
      this.els.closeContext.addEventListener('click', () => store.setUI({ activeModal: null }));
      this.els.modalSettings.addEventListener('click', (e) => e.stopPropagation());
      this.els.modalContext.addEventListener('click', (e) => e.stopPropagation());
      // Backdrop
      this.els.backdrop.addEventListener('click', () => {
        if (store.state.ui.activeModal) store.setUI({ activeModal: null });
        else if (store.state.ui.panelOpen) store.setUI({ panelOpen: false });
      });
      // Upload
      this.els.btnUpload.addEventListener('click', () => this.els.fileUpload.click());
      this.els.fileUpload.addEventListener('change', (e) => {
        [...e.target.files].forEach(f => store.addUpload(f));
        store.addMessage('system', `📎 ${e.target.files.length} file(s) added to context.`);
        e.target.value = '';
      });
      // Send message
      this.els.send.addEventListener('click', () => window.ForgeEditAI.sendMessage());
      this.els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.ForgeEditAI.sendMessage(); }
      });
      // Settings modal
      this.els.setSave.addEventListener('click', () => {
        store.setSettings({
          provider: this.els.setProvider.value,
          apiKey: this.els.setKey.value,
          model: this.els.setModel.value,
          endpoint: this.els.setEndpoint.value,
          systemPrompt: this.els.setPrompt.value,
          ttlHours: parseInt(this.els.setTTL.value),
          stream: this.els.setStream.checked,
          rememberUI: this.els.setRememberUI.checked,
          autoOpen: this.els.setAutoOpen.checked,
          useContext: this.els.setUseContext.checked
        });
        store.setUI({ activeModal: null });
      });
      this.els.setResetApi.addEventListener('click', () => { store.resetApi(); store.setUI({ activeModal: null }); });
      this.els.setResetHistory.addEventListener('click', () => { store.clearHistory(); store.setUI({ activeModal: null }); });
      this.els.setClearAll.addEventListener('click', () => { store.clearAll(); store.setUI({ activeModal: null }); });
      // Context modal
      this.els.ctxSearch.addEventListener('input', (e) => store.setUI({ searchQuery: e.target.value }));
      this.els.ctxSelectAll.addEventListener('click', () => this._selectAllContext(true));
      this.els.ctxClear.addEventListener('click', () => this._selectAllContext(false));
      this.els.ctxApply.addEventListener('click', () => {
        const checkboxes = this.els.ctxTree.querySelectorAll('input[type=checkbox]');
        const paths = [];
        checkboxes.forEach(cb => { if (cb.checked) paths.push(cb.dataset.path); });
        store.setContext(paths);
        store.setUI({ activeModal: null });
      });
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          store.setUI({ panelOpen: !store.state.ui.panelOpen });
        }
        if (e.key === 'Escape') {
          if (store.state.ui.activeModal) store.setUI({ activeModal: null });
          else if (store.state.ui.panelOpen) store.setUI({ panelOpen: false });
        }
      });
    }

    _selectAllContext(checked) {
      const cbs = this.els.ctxTree.querySelectorAll('input[type=checkbox]');
      cbs.forEach(cb => cb.checked = checked);
    }

    render() {
      const state = this.store.state;
      // Panel
      this.els.panel.classList.toggle('open', state.ui.panelOpen);
      // Backdrop
      const backdropActive = state.ui.panelOpen || !!state.ui.activeModal;
      this.els.backdrop.classList.toggle('active', backdropActive);
      // Modals
      this.els.modalSettings.classList.toggle('open', state.ui.activeModal === 'settings');
      this.els.modalContext.classList.toggle('open', state.ui.activeModal === 'context');
      // Subtitle
      this.els.subtitle.textContent = `${state.settings.provider || 'none'} · ${state.settings.model || 'none'} · ${state.contextPaths.size} files`;
      // Settings inputs
      if (state.ui.activeModal === 'settings') {
        this.els.setProvider.value = state.settings.provider;
        this.els.setKey.value = state.settings.apiKey;
        this.els.setModel.value = state.settings.model;
        this.els.setEndpoint.value = state.settings.endpoint;
        this.els.setPrompt.value = state.settings.systemPrompt;
        this.els.setTTL.value = state.settings.ttlHours;
        this.els.setStream.checked = state.settings.stream;
        this.els.setRememberUI.checked = state.settings.rememberUI;
        this.els.setAutoOpen.checked = state.settings.autoOpen;
        this.els.setUseContext.checked = state.settings.useContext;
      }
      // Messages
      this.renderMessages();
      // Context tree
      if (state.ui.activeModal === 'context') this.renderContextTree();
    }

    renderMessages() {
      const { messages } = this.store.state;
      const container = this.els.messages;
      if (messages.length === 0) {
        container.innerHTML = '<div class="feai-msg system">Welcome! Select context, then start chatting.</div>';
        return;
      }
      // Efficient: only append new messages
      const currentCount = container.children.length;
      if (currentCount === 0) container.innerHTML = '';
      for (let i = currentCount; i < messages.length; i++) {
        const msg = messages[i];
        const div = document.createElement('div');
        div.className = `feai-msg ${msg.role}`;
        div.id = `msg-${msg.id}`;
        div.innerHTML = Utils.renderMarkdown(msg.content);
        container.appendChild(div);
      }
      container.scrollTop = container.scrollHeight;
    }

    updateMessageDOM(id, content) {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.innerHTML = Utils.renderMarkdown(content);
        this.els.messages.scrollTop = this.els.messages.scrollHeight;
      }
    }

    async renderContextTree() {
      const treeContainer = this.els.ctxTree;
      try {
        // Cek apakah database tersedia
        if (!this.db || !this.db.db) {
          treeContainer.innerHTML = '<div class="feai-empty">Database not available. Open a file in ForgeEdit first.</div>';
          return;
        }
        const files = await this.db.getAll(CONFIG.STORE_FILES);
        const tree = this._buildTree(files);
        const { expandedFolders, searchQuery } = this.store.state.ui;
        const buildHTML = (node) => {
          if (!node.children || node.children.size === 0) return '';
          let html = '<ul class="feai-tree">';
          const entries = [...node.children.values()].sort((a, b) => (b.type === 'folder') - (a.type === 'folder') || a.name.localeCompare(b.name));
          for (const entry of entries) {
            if (searchQuery && !entry.name.toLowerCase().includes(searchQuery.toLowerCase())) continue;
            const isOpen = expandedFolders.has(entry.path);
            const isChecked = this.store.state.contextPaths.has(entry.path);
            html += `<li>
              <div class="feai-tree-item ${entry.type}" data-path="${entry.path}">
                <span class="feai-caret ${isOpen ? 'open' : ''}" data-caret>${entry.type === 'folder' ? '▸' : '•'}</span>
                <input type="checkbox" class="feai-checkbox" ${isChecked ? 'checked' : ''} data-path="${entry.path}">
                <span>${entry.name}</span>
              </div>
              ${entry.type === 'folder' && isOpen ? buildHTML(entry) : ''}
            </li>`;
          }
          html += '</ul>';
          return html;
        };
        treeContainer.innerHTML = buildHTML(tree) || '<div class="feai-empty">No files in project.</div>';
        // Event delegation for caret clicks
        treeContainer.querySelectorAll('[data-caret]').forEach(caret => {
          caret.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = caret.parentElement.dataset.path;
            if (path) this.store.toggleFolder(path);
          });
        });
      } catch { treeContainer.innerHTML = '<div class="feai-empty">Failed to load tree.</div>'; }
    }

    _buildTree(flatFiles) {
      const root = { name: '/', path: '/', type: 'folder', children: new Map() };
      flatFiles.forEach(file => {
        const parts = file.path.split('/').filter(Boolean);
        let node = root;
        let cumPath = '';
        parts.forEach((part, idx) => {
          cumPath += '/' + part;
          if (!node.children.has(part)) {
            node.children.set(part, {
              name: part,
              path: cumPath,
              type: idx === parts.length - 1 ? file.type : 'folder',
              children: new Map()
            });
          }
          node = node.children.get(part);
        });
      });
      return root;
    }
  }

  // ===========================================================================
  // APP ORCHESTRATOR
  // ===========================================================================
  class App {
    constructor() {
      this.db = new ForgeEditDB();
      this.store = new Store();
      this.ui = new UI(this.store, this.db);
    }

    async init() {
      try {
        await this.db.init();
      } catch (err) {
        console.error('[ForgeEdit AI] Failed to initialize database:', err);
        // Fallback: tetap jalankan tanpa database, widget akan menggunakan localStorage saja
        console.warn('[ForgeEdit AI] Running in fallback mode without IndexedDB');
      }
      // Load settings from localStorage
      const savedSettings = LocalStore.load('settings', null);
      if (savedSettings) {
        this.store.setSettings({ ...this.store.state.settings, ...savedSettings });
      }
      // Load history
      const savedHistory = LocalStore.load('history', []);
      if (Array.isArray(savedHistory)) {
        savedHistory.forEach(m => this.store.state.messages.push(m));
      }
      // Load context selection
      const savedCtx = LocalStore.load('context', []);
      if (Array.isArray(savedCtx)) this.store.setContext(savedCtx);
      // Load uploads (only metadata, no content stored)
      const savedUploads = LocalStore.load('uploads', []);
      if (Array.isArray(savedUploads)) this.store.state.uploadFiles = savedUploads;
      // Load UI preferences
      const savedUI = LocalStore.load('ui', {});
      if (savedUI) this.store.setUI({ ...this.store.state.ui, ...savedUI });
      // Init UI
      this.ui.init();
      // Auto open if setting
      if (this.store.state.settings.autoOpen) this.store.setUI({ panelOpen: true });
      // Save state to localStorage on changes (debounced)
      let saveTimer;
      this.store.subscribe(() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => this.saveState(), 200);
      });
      // Expose API
      window.ForgeEditAI = {
        sendMessage: () => this.sendMessage(),
        open: () => this.store.setUI({ panelOpen: true }),
        close: () => this.store.setUI({ panelOpen: false }),
        toggle: () => this.store.setUI({ panelOpen: !this.store.state.ui.panelOpen }),
        addMessage: (role, content) => this.store.addMessage(role, content),
        setContext: (paths) => this.store.setContext(paths),
        getState: () => this.store.state,
        version: '4.0.0'
      };
      console.log('%c⚡ ForgeEdit AI Fusion v4.0 Ready', 'color:#58a6ff;font-weight:bold;');
    }

    async sendMessage() {
      const input = this.ui.els.input;
      const text = input.value.trim();
      if (!text) return;
      const { settings, messages } = this.store.state;
      if (!settings.apiKey) {
        this.store.addMessage('system', '⚠️ Please configure API Key in Settings.');
        return;
      }
      input.value = '';
      this.store.addMessage('user', text);

      // Build context payload
      let contextStr = '';
      if (settings.useContext && this.db && this.db.db) {
        // Add file contents from context paths
        for (const path of this.store.state.contextPaths) {
          try {
            const fileData = await this.db.get(CONFIG.STORE_FILES, path);
            if (fileData && fileData.content) contextStr += `\nFile: ${path}\n${fileData.content}\n---`;
          } catch {}
        }
        // Add uploaded files info
        if (this.store.state.uploadFiles.length) {
          contextStr += '\n[Uploaded files]\n' + this.store.state.uploadFiles.map(f => `- ${f.name}`).join('\n');
        }
      }
      // Dapatkan provider
      const provider = ProviderFactory.get(settings.provider);
      const endpoint = settings.endpoint || provider.defaultEndpoint.replace('{{model}}', settings.model).replace('{{key}}', settings.apiKey);
      // Placeholder untuk streaming
      this.store.addMessage('ai', '...');
      const aiMsgId = this.store.state.messages[this.store.state.messages.length - 1].id;
      let fullResponse = '';
      try {
        const body = provider.transform(settings.model, settings.apiKey, messages.slice(0, -1), settings.systemPrompt, contextStr);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: provider.getHeaders(settings.apiKey),
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (settings.stream) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
              const chunkText = provider.parseChunk(dataStr);
              if (chunkText) {
                fullResponse += chunkText;
                this.ui.updateMessageDOM(aiMsgId, fullResponse);
              }
            }
          }
          if (buffer.trim()) {
            const chunkText = provider.parseChunk(buffer.trim());
            if (chunkText) fullResponse += chunkText;
          }
        } else {
          // Non-streaming fallback
          const data = await response.json();
          fullResponse = data.candidates?.[0]?.content?.parts?.[0]?.text ||
                         data.choices?.[0]?.message?.content || '';
        }
        this.store.updateLastMessage(fullResponse || '(empty response)');
      } catch (err) {
        this.store.updateLastMessage(`❌ Error: ${err.message}`);
      }
    }

    saveState() {
      const { state } = this.store;
      LocalStore.save('settings', state.settings, state.settings.ttlHours);
      LocalStore.save('history', state.messages, state.settings.ttlHours);
      LocalStore.save('context', [...state.contextPaths], state.settings.ttlHours);
      LocalStore.save('uploads', state.uploadFiles, state.settings.ttlHours);
      if (state.settings.rememberUI) {
        LocalStore.save('ui', {
          panelExpanded: state.ui.panelExpanded,
          // Tidak menyimpan panelOpen agar tidak auto-buka
        }, state.settings.ttlHours);
      }
    }
  }

  // ===========================================================================
  // BOOTSTRAP
  // ===========================================================================
  const app = new App();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
  else app.init();

})();
