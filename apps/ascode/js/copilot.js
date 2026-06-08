/**
 * copilot.js — AI Copilot Module
 *
 * FIX #2: Sanitize AI response before rendering (prevent XSS from markdown)
 * FIX #11: Message history pruning (max 50 messages)
 * Provider support: Gemini, Groq, OpenRouter
 */
window.AS = window.AS || {};

AS.Copilot = (function() {
  'use strict';

  const MAX_MESSAGES = 50;
  let messages = [];
  let isStreaming = false;

  function getMessages() { return messages; }

  function setStreaming(val) { isStreaming = val; }
  function getStreaming() { return isStreaming; }

  /**
   * FIX #11: Prune message history to prevent unbounded growth.
   * Keeps system context + most recent messages.
   */
  function pruneMessages() {
    if (messages.length <= MAX_MESSAGES) return;
    // Keep the last MAX_MESSAGES (most recent context is most relevant)
    messages = messages.slice(messages.length - MAX_MESSAGES);
  }

  /**
   * Build context string from selected files/folders for the AI prompt.
   */
  async function buildContext(selectedContext, db) {
    const contextParts = [];
    const all = await db.files.toArray();
    for (let path of selectedContext) {
      const record = all.find(function(r) { return r.path === path; });
      if (record && record.type === 'file' && record.content) {
        contextParts.push('--- File: ' + path + ' ---\n' + record.content.substring(0, 3000));
      } else if (record && record.type === 'folder') {
        const folderFiles = all.filter(function(r) {
          return r.path.startsWith(path + '/') && r.type === 'file';
        });
        for (let i = 0; i < Math.min(folderFiles.length, 10); i++) {
          const f = folderFiles[i];
          contextParts.push('--- File: ' + f.path + ' ---\n' + (f.content || '').substring(0, 2000));
        }
      }
    }
    return contextParts.join('\n\n');
  }

  // ---- Provider API Calls ----

  async function callGemini(apiKey, systemPrompt, msgList) {
    const contents = [];
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Understood. I will help you with your code.' }] });
    for (let msg of msgList) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      throw new Error(err.error?.message || 'API error ' + res.status);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
  }

  async function callGroq(apiKey, systemPrompt, msgList) {
    const allMessages = [{ role: 'system', content: systemPrompt }].concat(msgList);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: allMessages, temperature: 0.7, max_tokens: 4096 })
    });
    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      throw new Error(err.error?.message || 'API error ' + res.status);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response generated.';
  }

  async function callOpenRouter(apiKey, systemPrompt, msgList) {
    const allMessages = [{ role: 'system', content: systemPrompt }].concat(msgList);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 4096
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      throw new Error(err.error?.message || 'API error ' + res.status);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response generated.';
  }

  /**
   * Send a message to the selected AI provider.
   * @returns {Promise<string>} The AI response text
   */
  async function sendMessage(provider, apiKey, userMsg, contextStr) {
    messages.push({ role: 'user', content: userMsg });
    pruneMessages();

    const systemPrompt = 'You are an expert AI coding assistant integrated into AS Code Pastel editor. ' +
      'You help with code, debugging, explanations, and best practices. ' +
      'Be concise, accurate, and helpful. Use markdown formatting with code blocks when sharing code.' +
      (contextStr ? '\n\nHere is the current workspace context:\n' + contextStr : '');

    let response;
    if (provider === 'gemini') {
      response = await callGemini(apiKey, systemPrompt, messages);
    } else if (provider === 'groq') {
      response = await callGroq(apiKey, systemPrompt, messages);
    } else if (provider === 'openrouter') {
      response = await callOpenRouter(apiKey, systemPrompt, messages);
    } else {
      throw new Error('Unknown provider: ' + provider);
    }

    messages.push({ role: 'assistant', content: response });
    pruneMessages();
    return response;
  }

  // ---- FIX #2: Safe Markdown Rendering ----

  /**
   * Escape all HTML first, then apply safe markdown transformations.
   * This prevents any HTML/JS injection from AI responses.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMarkdown(text) {
    // Step 1: Escape ALL HTML to prevent XSS
    var escaped = escapeHtml(text);

    // Step 2: Apply safe markdown on escaped text
    // Fenced code blocks: ```lang\ncode\n```
    escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
      return '<pre><code>' + code + '</code></pre>';
    });
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold: **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }

  function clearMessages() {
    messages = [];
  }

  return {
    getMessages, setStreaming, getStreaming,
    buildContext, sendMessage,
    formatMarkdown, clearMessages,
    callGemini, callGroq, callOpenRouter,
    MAX_MESSAGES
  };
})();
