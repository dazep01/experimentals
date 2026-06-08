/**
 * sandbox.js — Sandboxed Code Execution Module
 *
 * FIX #1: Replaces `new Function(code)()` with sandboxed iframe execution.
 * The iframe has `sandbox="allow-scripts"` which prevents access to:
 * - parent.localStorage / parent.document
 * - parent.crypto / parent.fetch
 * - Any DOM of the parent page
 *
 * Features:
 * - Timeout protection (default 5s) to prevent infinite loops
 * - Returns captured console.log output
 * - Full isolation from parent scope
 */
window.AS = window.AS || {};

AS.Sandbox = (function() {
  'use strict';

  let iframe = null;
  let pendingResolve = null;
  let pendingReject = null;
  let timeoutId = null;
  const TIMEOUT_MS = 5000;

  /**
   * Initialize the sandbox iframe. Must be called after DOM is ready.
   */
  function init() {
    iframe = document.getElementById('sandboxFrame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'sandboxFrame';
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.srcdoc = `<html><body><script>
        window.addEventListener('message', function(e) {
          if (e.data && e.data.type === 'sandbox_exec') {
            var logs = [];
            var _origLog = console.log;
            var _origErr = console.error;
            var _origWarn = console.warn;
            console.log = function() {
              var args = Array.prototype.slice.call(arguments);
              logs.push({ level: 'log', args: args.map(String) });
            };
            console.error = function() {
              var args = Array.prototype.slice.call(arguments);
              logs.push({ level: 'error', args: args.map(String) });
            };
            console.warn = function() {
              var args = Array.prototype.slice.call(arguments);
              logs.push({ level: 'warn', args: args.map(String) });
            };
            try {
              var fn = new Function(e.data.code);
              var result = fn();
              console.log = _origLog;
              console.error = _origErr;
              console.warn = _origWarn;
              parent.postMessage({ type: 'sandbox_result', id: e.data.id, result: String(result != null ? result : ''), logs: logs }, '*');
            } catch (err) {
              console.log = _origLog;
              console.error = _origErr;
              console.warn = _origWarn;
              parent.postMessage({ type: 'sandbox_error', id: e.data.id, error: err.message, logs: logs }, '*');
            }
          }
        });
      <\/script></body></html>`;
      document.body.appendChild(iframe);
    }

    window.addEventListener('message', function(e) {
      if (!e.data) return;
      if (e.data.type === 'sandbox_result' && pendingResolve) {
        clearTimeout(timeoutId);
        var resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        resolve({ success: true, result: e.data.result, logs: e.data.logs || [] });
      }
      if (e.data.type === 'sandbox_error' && pendingReject) {
        clearTimeout(timeoutId);
        var reject = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        reject({ success: false, error: e.data.error, logs: e.data.logs || [] });
      }
    });
  }

  let execId = 0;

  /**
   * Execute code in the sandbox.
   * @param {string} code - JavaScript code to execute
   * @param {number} [timeout=5000] - Timeout in milliseconds
   * @returns {Promise<{success: boolean, result?: string, error?: string, logs: Array}>}
   */
  function execute(code, timeout) {
    timeout = timeout || TIMEOUT_MS;
    return new Promise(function(resolve, reject) {
      if (!iframe) init();
      execId++;
      pendingResolve = resolve;
      pendingReject = reject;

      timeoutId = setTimeout(function() {
        pendingResolve = null;
        pendingReject = null;
        // Reload iframe to kill running script
        var src = iframe.srcdoc;
        iframe.srcdoc = '';
        setTimeout(function() { iframe.srcdoc = src; }, 50);
        resolve({ success: false, error: 'Execution timed out after ' + timeout + 'ms', logs: [] });
      }, timeout);

      iframe.contentWindow.postMessage({ type: 'sandbox_exec', code: code, id: execId }, '*');
    });
  }

  /**
   * Format sandbox result for terminal output
   */
  function formatResult(outcome) {
    var lines = [];
    if (outcome.logs && outcome.logs.length > 0) {
      outcome.logs.forEach(function(log) {
        lines.push(log.args.join(' '));
      });
    }
    if (outcome.success) {
      if (outcome.result) lines.push(outcome.result);
    } else {
      lines.push('Error: ' + outcome.error);
    }
    return lines.join('\n') || '(no output)';
  }

  return { init, execute, formatResult };
})();
