/**
 * crypto.js — Secure Key Management Module
 *
 * FIX #4: Passphrase derived from origin + random salt (no hardcoded secret)
 * FIX #5: GitHub token encrypted alongside API keys (consistency)
 *
 * Encryption: AES-256-GCM with PBKDF2 key derivation (100K iterations)
 * Session: 7×24 hour max with automatic expiry
 * Storage: localStorage with encrypted payloads
 */
window.AS = window.AS || {};

AS.Crypto = (function() {
  'use strict';

  const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
  const KEY_STORAGE_KEY = 'AScode_pastel_keys';
  const SALT_STORAGE_KEY = 'AScode_pastel_salt';

  /**
   * FIX #4: Derive passphrase from origin + random salt instead of hardcoding.
   * The salt is generated once and stored in localStorage. This means:
   * - Source code contains no secret
   * - Passphrase changes per origin/device
   * - Attacker needs both source access AND localStorage to derive key
   */
  function getPassphrase() {
    let salt = localStorage.getItem(SALT_STORAGE_KEY);
    if (!salt) {
      salt = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(SALT_STORAGE_KEY, salt);
    }
    // Combine origin fingerprint with the random salt
    const origin = window.location.origin || 'AScode-pastel-local';
    return origin + ':' + salt;
  }

  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(getPassphrase(), salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    return {
      s: Array.from(salt),
      v: Array.from(iv),
      d: Array.from(new Uint8Array(encrypted)),
      t: Date.now()
    };
  }

  async function decrypt(obj) {
    if (!obj || !obj.s) return null;
    const key = await deriveKey(getPassphrase(), new Uint8Array(obj.s));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(obj.v) },
      key,
      new Uint8Array(obj.d)
    );
    return new TextDecoder().decode(decrypted);
  }

  function getStoredKeys() {
    try { return JSON.parse(localStorage.getItem(KEY_STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveStoredKeys(keys) {
    localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(keys));
  }

  // ---- Public API ----

  async function saveKey(provider, key) {
    const keys = getStoredKeys();
    keys[provider] = await encrypt(key);
    saveStoredKeys(keys);
    return true;
  }

  async function getKey(provider) {
    const keys = getStoredKeys();
    const entry = keys[provider];
    if (!entry) return null;
    if (Date.now() - entry.t > SESSION_MAX_MS) {
      delete keys[provider];
      saveStoredKeys(keys);
      return null; // Expired
    }
    try { return await decrypt(entry); }
    catch { return null; }
  }

  function clearKey(provider) {
    const keys = getStoredKeys();
    delete keys[provider];
    saveStoredKeys(keys);
  }

  function hasKey(provider) {
    const keys = getStoredKeys();
    return !!keys[provider];
  }

  function getSessionRemaining(provider) {
    const keys = getStoredKeys();
    const entry = keys[provider];
    if (!entry) return null;
    const remaining = SESSION_MAX_MS - (Date.now() - entry.t);
    return remaining > 0 ? remaining : 0;
  }

  function isSessionExpired(provider) {
    const keys = getStoredKeys();
    const entry = keys[provider];
    if (!entry) return false;
    return Date.now() - entry.t > SESSION_MAX_MS;
  }

  // FIX #5: Encrypt GitHub token with same mechanism
  const GH_KEY = 'github_token';

  async function saveGitHubToken(token) {
    return saveKey(GH_KEY, token);
  }

  async function getGitHubToken() {
    return getKey(GH_KEY);
  }

  function clearGitHubToken() {
    clearKey(GH_KEY);
  }

  return {
    saveKey, getKey, clearKey, hasKey, getSessionRemaining, isSessionExpired,
    saveGitHubToken, getGitHubToken, clearGitHubToken,
    SESSION_MAX_MS
  };
})();
