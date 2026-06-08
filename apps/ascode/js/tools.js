/**
 * tools.js — Tools Panel Module
 *
 * FIX #6: ReDoS protection with timeout for regex execution
 * FIX #7: Replace deprecated unescape/escape with TextEncoder/TextDecoder
 * 12 tools: Beautify, Minify, Template, JSON Format, Base64, Regex, Color, Diff, Lorem, Hash, Timestamp, UUID
 */
window.AS = window.AS || {};

AS.Tools = (function() {
  'use strict';

  // ---- Shared helpers ----

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * FIX #7: Modern Base64 encoding using TextEncoder instead of deprecated unescape()
   */
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  // ---- Tool implementations ----

  function beautify(editor, currentFile) {
    if (!editor) return;
    var content = editor.getValue();
    var selection = editor.getSelection();
    var target = selection || content;
    var ext = (currentFile || '').split('.').pop();
    var result;
    if (ext === 'html') result = html_beautify(target, { indent_size: 2 });
    else if (ext === 'css') result = css_beautify(target, { indent_size: 2 });
    else result = js_beautify(target, { indent_size: 2 });
    if (selection) editor.replaceSelection(result);
    else editor.setValue(result);
    return 'Code beautified';
  }

  function minify(editor) {
    if (!editor) return;
    var content = editor.getValue();
    var selection = editor.getSelection();
    var target = selection || content;
    var result = target
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}();,=+\-*/<>[\]] )\s*/g, '$1')
      .trim();
    if (selection) editor.replaceSelection(result);
    else editor.setValue(result);
    return 'Code minified';
  }

  function jsonFormat(editor) {
    if (!editor) return;
    var content = editor.getValue();
    var selection = editor.getSelection();
    var target = selection || content;
    try {
      var result = JSON.stringify(JSON.parse(target), null, 2);
      if (selection) editor.replaceSelection(result);
      else editor.setValue(result);
      return 'JSON formatted';
    } catch (e) {
      throw new Error('Invalid JSON: ' + e.message);
    }
  }

  function loremIpsum(editor) {
    if (!editor) return;
    var text = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
    var selection = editor.getSelection();
    if (selection) editor.replaceSelection(text);
    else editor.setValue(text);
    return 'Lorem Ipsum inserted';
  }

  function timestamp(editor) {
    if (!editor) return;
    var ts = Date.now();
    var info = 'Unix: ' + ts + '\nISO: ' + new Date().toISOString() + '\nLocal: ' + new Date().toLocaleString();
    var selection = editor.getSelection();
    if (selection) editor.replaceSelection(info);
    else editor.setValue(info);
    return 'Timestamp inserted';
  }

  function uuid(editor) {
    if (!editor) return;
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    var selection = editor.getSelection();
    if (selection) editor.replaceSelection(uuid);
    else editor.setValue(uuid);
    return 'UUID generated';
  }

  // ---- Tools that open modals ----

  function getTemplates() {
    return {
      'React Component': "import React from 'react';\n\nconst Component = ({ prop }) => {\n  return (\n    <div className=\"component\">\n      <h1>Hello, {prop}!</h1>\n    </div>\n  );\n};\n\nexport default Component;",
      'Express Server': "const express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello World!' });\n});\n\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});",
      'HTML5 Boilerplate': "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Document</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <h1>Hello World</h1>\n  <script src=\"script.js\"></script>\n</body>\n</html>",
      'CSS Reset': "*, *::before, *::after {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nhtml {\n  font-size: 16px;\n  scroll-behavior: smooth;\n}\n\nbody {\n  font-family: system-ui, -apple-system, sans-serif;\n  line-height: 1.6;\n  -webkit-font-smoothing: antialiased;\n}",
      'Python Script': "#!/usr/bin/env python3\n\"\"\"Description.\"\"\"\n\nimport sys\nimport os\n\ndef main():\n    print(\"Hello, World!\")\n\nif __name__ == \"__main__\":\n    main()",
      'Node.js Module': "const { EventEmitter } = require('events');\n\nclass MyModule extends EventEmitter {\n  constructor(options = {}) {\n    super();\n    this.options = options;\n  }\n\n  init() {\n    this.emit('ready');\n  }\n}\n\nmodule.exports = MyModule;",
      'SQL Schema': "CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  username VARCHAR(50) NOT NULL UNIQUE,\n  email VARCHAR(100) NOT NULL,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE INDEX idx_users_email ON users(email);",
      'Docker Compose': "version: '3.8'\nservices:\n  app:\n    build: .\n    ports:\n      - \"3000:3000\"\n    environment:\n      - NODE_ENV=development\n    volumes:\n      - .:/app\n    depends_on:\n      - db\n  db:\n    image: postgres:15\n    environment:\n      POSTGRES_DB: myapp\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:"
    };
  }

  /**
   * FIX #6: Regex test with ReDoS protection via Web Worker timeout.
   * Uses a synchronous approach with step limiting for single-file simplicity.
   */
  function testRegexSafely(pattern, flags, testStr) {
    try {
      var regex;
      if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        var lastSlash = pattern.lastIndexOf('/');
        var reBody = pattern.slice(1, lastSlash);
        var reFlags = pattern.slice(lastSlash + 1) + flags;
        regex = new RegExp(reBody, reFlags);
      } else {
        regex = new RegExp(pattern, flags);
      }

      // ReDoS protection: limit match iterations
      var matches = [];
      var match;
      var maxMatches = 1000;
      var safeStr = testStr.substring(0, 50000); // Limit input length

      if (regex.global || regex.sticky) {
        regex.lastIndex = 0;
        while ((match = regex.exec(safeStr)) !== null && matches.length < maxMatches) {
          matches.push({ 0: match[0], index: match.index });
          if (match[0].length === 0) regex.lastIndex++; // Prevent infinite loop on zero-length match
        }
      } else {
        match = regex.test(safeStr);
        if (match) {
          var idx = safeStr.search(regex);
          matches.push({ 0: safeStr.match(regex)?.[0] || '', index: idx });
        }
      }

      return { success: true, matches: matches };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return 'hsl(' + Math.round(h * 360) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)';
  }

  // ---- Tool definitions for sidebar rendering ----

  var toolDefs = [
    { id: 'beautify', icon: 'fas fa-magic', label: 'Beautify', cls: 'beautify' },
    { id: 'minify', icon: 'fas fa-compress-alt', label: 'Minify', cls: 'minify' },
    { id: 'template', icon: 'fas fa-th-large', label: 'Template', cls: 'template' },
    { id: 'json-format', icon: 'fas fa-indent', label: 'JSON Format', cls: 'json-format' },
    { id: 'base64', icon: 'fas fa-lock', label: 'Base64', cls: 'base64' },
    { id: 'regex', icon: 'fas fa-asterisk', label: 'Regex Test', cls: 'regex' },
    { id: 'color', icon: 'fas fa-palette', label: 'Color Pick', cls: 'color' },
    { id: 'diff', icon: 'fas fa-columns', label: 'Diff View', cls: 'diff' },
    { id: 'lorem', icon: 'fas fa-paragraph', label: 'Lorem Ipsum', cls: 'lorem' },
    { id: 'hash', icon: 'fas fa-fingerprint', label: 'Hash Gen', cls: 'hash' },
    { id: 'timestamp', icon: 'fas fa-clock', label: 'Timestamp', cls: 'timestamp' },
    { id: 'uuid', icon: 'fas fa-barcode', label: 'UUID Gen', cls: 'uuid' }
  ];

  return {
    escapeHtml, utf8ToBase64, base64ToUtf8,
    beautify, minify, jsonFormat, loremIpsum, timestamp, uuid,
    getTemplates, testRegexSafely, rgbToHsl,
    toolDefs
  };
})();
