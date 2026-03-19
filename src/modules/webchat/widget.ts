/**
 * Returns the embeddable chat widget HTML/JS/CSS as a string.
 * Served at GET /api/webchat/:tenantId/widget.js
 */
export function getWidgetScript(tenantId: string, baseUrl: string): string {
  return `
(function() {
  if (window.__lkChatLoaded) return;
  window.__lkChatLoaded = true;

  var TENANT_ID = ${JSON.stringify(tenantId)};
  var BASE_URL  = ${JSON.stringify(baseUrl)};
  var SESSION_KEY = 'lk_chat_session_' + TENANT_ID;

  // ── Styles ──────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = \`
    #lk-chat-bubble {
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      width: 60px; height: 60px; border-radius: 50%;
      background: #2563eb; color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 14px rgba(37,99,235,0.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #lk-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(37,99,235,0.5); }
    #lk-chat-bubble svg { width: 28px; height: 28px; }

    #lk-chat-window {
      position: fixed; bottom: 90px; right: 20px; z-index: 99999;
      width: 380px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.18);
      display: none; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #lk-chat-window.open { display: flex; }

    #lk-chat-header {
      background: #2563eb; color: #fff; padding: 16px 18px;
      font-size: 15px; font-weight: 600;
      display: flex; align-items: center; justify-content: space-between;
    }
    #lk-chat-header button {
      background: none; border: none; color: #fff; cursor: pointer;
      font-size: 20px; line-height: 1; padding: 0 0 0 8px;
    }

    #lk-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .lk-msg {
      max-width: 80%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.45; word-wrap: break-word;
      white-space: pre-wrap;
    }
    .lk-msg a { color: inherit; text-decoration: underline; }
    .lk-msg-user {
      align-self: flex-end; background: #2563eb; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .lk-msg-bot {
      align-self: flex-start; background: #f1f5f9; color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .lk-msg-typing {
      align-self: flex-start; background: #f1f5f9; color: #94a3b8;
      border-bottom-left-radius: 4px; font-style: italic;
    }

    #lk-chat-input-bar {
      display: flex; border-top: 1px solid #e2e8f0; padding: 10px 12px; gap: 8px;
    }
    #lk-chat-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 10px 14px; font-size: 14px; outline: none;
      font-family: inherit; resize: none; min-height: 20px; max-height: 80px;
    }
    #lk-chat-input:focus { border-color: #2563eb; }
    #lk-chat-send {
      background: #2563eb; color: #fff; border: none; border-radius: 10px;
      padding: 0 16px; cursor: pointer; font-size: 14px; font-weight: 600;
      white-space: nowrap;
    }
    #lk-chat-send:disabled { opacity: 0.5; cursor: default; }

    @media (max-width: 480px) {
      #lk-chat-window {
        bottom: 0; right: 0; left: 0;
        width: 100%; height: 100vh; max-height: 100vh;
        border-radius: 0;
      }
      #lk-chat-bubble { bottom: 16px; right: 16px; }
    }
  \`;
  document.head.appendChild(css);

  // ── Chat Bubble ─────────────────────────────────────────
  var bubble = document.createElement('button');
  bubble.id = 'lk-chat-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  document.body.appendChild(bubble);

  // ── Chat Window ─────────────────────────────────────────
  var win = document.createElement('div');
  win.id = 'lk-chat-window';
  win.innerHTML = \`
    <div id="lk-chat-header">
      <span>Chat</span>
      <button id="lk-chat-close" aria-label="Close chat">&times;</button>
    </div>
    <div id="lk-chat-messages"></div>
    <div id="lk-chat-input-bar">
      <input id="lk-chat-input" type="text" placeholder="Digite sua mensagem..." autocomplete="off" />
      <button id="lk-chat-send" disabled>Enviar</button>
    </div>
  \`;
  document.body.appendChild(win);

  var messagesDiv = document.getElementById('lk-chat-messages');
  var input       = document.getElementById('lk-chat-input');
  var sendBtn     = document.getElementById('lk-chat-send');
  var sessionId   = localStorage.getItem(SESSION_KEY);
  var sending     = false;

  // ── Toggle ──────────────────────────────────────────────
  bubble.addEventListener('click', function() {
    win.classList.toggle('open');
    if (win.classList.contains('open')) {
      if (!sessionId) initSession();
      input.focus();
    }
  });
  document.getElementById('lk-chat-close').addEventListener('click', function() {
    win.classList.remove('open');
  });

  // ── Input Handling ──────────────────────────────────────
  input.addEventListener('input', function() {
    sendBtn.disabled = !input.value.trim() || sending;
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  function addMessage(text, cls) {
    var div = document.createElement('div');
    div.className = 'lk-msg ' + cls;
    // Convert URLs to links
    div.innerHTML = text.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return div;
  }

  function initSession() {
    fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
      // Load existing messages if resuming
      return fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/messages/' + sessionId);
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(function(m) {
          addMessage(m.content, m.role === 'user' ? 'lk-msg-user' : 'lk-msg-bot');
        });
      }
    })
    .catch(function(err) { console.error('LK Chat: session init failed', err); });
  }

  function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = '';

    addMessage(text, 'lk-msg-user');
    var typing = addMessage('Digitando...', 'lk-msg-typing');

    fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, text: text })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      typing.remove();
      if (data.reply) {
        addMessage(data.reply, 'lk-msg-bot');
        // Update session if changed
        if (data.sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem(SESSION_KEY, sessionId);
        }
      } else if (data.error) {
        addMessage('Desculpe, ocorreu um erro. Tente novamente.', 'lk-msg-bot');
      }
    })
    .catch(function() {
      typing.remove();
      addMessage('Desculpe, não consegui conectar. Tente novamente.', 'lk-msg-bot');
    })
    .finally(function() {
      sending = false;
      sendBtn.disabled = !input.value.trim();
      input.focus();
    });
  }

  // Auto-init session on load if we already have one
  if (sessionId) initSession();
})();
`;
}
