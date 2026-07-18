/**
 * Returns the embeddable chat widget HTML/JS/CSS as a string.
 * Served at GET /api/webchat/:tenantId/widget.js
 *
 * The widget fetches /api/webchat/:tenantId/config to load per-tenant
 * branding (colors, header title, welcome message, position).
 */
export function getWidgetScript(tenantId: string, baseUrl: string): string {
  return `
(function() {
  if (window.__jednaChatLoaded) return;
  window.__jednaChatLoaded = true;

  var TENANT_ID = ${JSON.stringify(tenantId)};
  var BASE_URL  = ${JSON.stringify(baseUrl)};
  var SESSION_KEY = 'jedna_chat_session_' + TENANT_ID;

  // ── Default config (overridden by server) ──────────────────
  var cfg = {
    primaryColor: '#2563eb',
    headerTitle: 'Chat with us',
    welcomeMessage: null,
    position: 'bottom-right',
    avatarUrl: null,
    bubbleIcon: 'chat'
  };

  // ── Helpers ────────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function darken(hex, amount) {
    var r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    var g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    var b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return '#' + [r, g, b].map(function(c) { return c.toString(16).padStart(2, '0'); }).join('');
  }

  var BUBBLE_ICONS = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
    message: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>',
    help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>'
  };

  // ── Build UI ──────────────────────────────────────────────
  function buildWidget() {
    var c = cfg.primaryColor;
    var posRight = cfg.position === 'bottom-right';

    // ── Styles ──────────────────────────────────────────────
    var css = document.createElement('style');
    css.textContent = \`
      #jedna-chat-bubble {
        position: fixed; bottom: 20px; \${posRight ? 'right: 20px' : 'left: 20px'}; z-index: 99999;
        width: 60px; height: 60px; border-radius: 50%;
        background: \${c}; color: #fff; border: none; cursor: pointer;
        box-shadow: 0 4px 14px \${hexToRgba(c, 0.4)};
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #jedna-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 20px \${hexToRgba(c, 0.5)}; }
      #jedna-chat-bubble svg { width: 28px; height: 28px; }

      #jedna-chat-window {
        position: fixed; bottom: 90px; \${posRight ? 'right: 20px' : 'left: 20px'}; z-index: 99999;
        width: 380px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);
        background: #fff; border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.18);
        display: none; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #jedna-chat-window.open { display: flex; }

      #jedna-chat-header {
        background: \${c}; color: #fff; padding: 16px 18px;
        font-size: 15px; font-weight: 600;
        display: flex; align-items: center; justify-content: space-between;
      }
      #jedna-chat-header-left { display: flex; align-items: center; gap: 10px; }
      #jedna-chat-avatar {
        width: 32px; height: 32px; border-radius: 50%;
        object-fit: cover; border: 2px solid rgba(255,255,255,0.3);
      }
      #jedna-chat-header button {
        background: none; border: none; color: #fff; cursor: pointer;
        font-size: 20px; line-height: 1; padding: 0 0 0 8px;
      }

      #jedna-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .jedna-msg {
        max-width: 80%; padding: 10px 14px; border-radius: 14px;
        font-size: 14px; line-height: 1.45; word-wrap: break-word;
        white-space: pre-wrap;
      }
      .jedna-msg a { color: inherit; text-decoration: underline; }
      .jedna-msg-user {
        align-self: flex-end; background: \${c}; color: #fff;
        border-bottom-right-radius: 4px;
      }
      .jedna-msg-bot {
        align-self: flex-start; background: #f1f5f9; color: #1e293b;
        border-bottom-left-radius: 4px;
      }
      .jedna-msg-typing {
        align-self: flex-start; background: #f1f5f9; color: #94a3b8;
        border-bottom-left-radius: 4px; font-style: italic;
      }

      #jedna-chat-input-bar {
        display: flex; border-top: 1px solid #e2e8f0; padding: 10px 12px; gap: 8px;
      }
      #jedna-chat-input {
        flex: 1; border: 1px solid #e2e8f0; border-radius: 10px;
        padding: 10px 14px; font-size: 14px; outline: none;
        font-family: inherit; resize: none; min-height: 20px; max-height: 80px;
      }
      #jedna-chat-input:focus { border-color: \${c}; }
      #jedna-chat-send {
        background: \${c}; color: #fff; border: none; border-radius: 10px;
        padding: 0 16px; cursor: pointer; font-size: 14px; font-weight: 600;
        white-space: nowrap;
      }
      #jedna-chat-send:hover { background: \${darken(c, 20)}; }
      #jedna-chat-send:disabled { opacity: 0.5; cursor: default; }

      #jedna-chat-powered {
        text-align: center; padding: 4px 0; font-size: 11px; color: #94a3b8;
        border-top: 1px solid #f1f5f9;
      }
      #jedna-chat-powered a { color: #64748b; text-decoration: none; }
      #jedna-chat-powered a:hover { text-decoration: underline; }

      @media (max-width: 480px) {
        #jedna-chat-window {
          bottom: 0; right: 0; left: 0;
          width: 100%; height: 100vh; max-height: 100vh;
          border-radius: 0;
        }
        #jedna-chat-bubble { bottom: 16px; \${posRight ? 'right: 16px' : 'left: 16px'}; }
      }
    \`;
    document.head.appendChild(css);

    // ── Chat Bubble ─────────────────────────────────────────
    var bubble = document.createElement('button');
    bubble.id = 'jedna-chat-bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (BUBBLE_ICONS[cfg.bubbleIcon] || BUBBLE_ICONS.chat) + '</svg>';
    document.body.appendChild(bubble);

    // ── Chat Window ─────────────────────────────────────────
    var avatarHtml = cfg.avatarUrl
      ? '<img id="jedna-chat-avatar" src="' + cfg.avatarUrl + '" alt="avatar" />'
      : '';

    var win = document.createElement('div');
    win.id = 'jedna-chat-window';
    win.innerHTML = \`
      <div id="jedna-chat-header">
        <div id="jedna-chat-header-left">
          \${avatarHtml}
          <span>\${cfg.headerTitle}</span>
        </div>
        <button id="jedna-chat-close" aria-label="Close chat">&times;</button>
      </div>
      <div id="jedna-chat-messages"></div>
      <div id="jedna-chat-input-bar">
        <input id="jedna-chat-input" type="text" placeholder="Type your message..." autocomplete="off" />
        <button id="jedna-chat-send" disabled>Send</button>
      </div>
      <div id="jedna-chat-powered">Powered by <a href="https://jednamarketing.com" target="_blank" rel="noopener">Jedna LLC</a></div>
    \`;
    document.body.appendChild(win);

    var messagesDiv = document.getElementById('jedna-chat-messages');
    var input       = document.getElementById('jedna-chat-input');
    var sendBtn     = document.getElementById('jedna-chat-send');
    var sessionId   = localStorage.getItem(SESSION_KEY);
    var sending     = false;
    var welcomed    = false;

    // ── Toggle ──────────────────────────────────────────────
    bubble.addEventListener('click', function() {
      win.classList.toggle('open');
      if (win.classList.contains('open')) {
        if (!sessionId) initSession();
        else if (!welcomed) showWelcome();
        input.focus();
      }
    });
    document.getElementById('jedna-chat-close').addEventListener('click', function() {
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
      div.className = 'jedna-msg ' + cls;
      div.innerHTML = text.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      return div;
    }

    function showWelcome() {
      if (welcomed) return;
      welcomed = true;
      if (cfg.welcomeMessage && messagesDiv.children.length === 0) {
        addMessage(cfg.welcomeMessage, 'jedna-msg-bot');
      }
    }

    function initSession() {
      fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
      })
      .then(function(r) {
        if (!r.ok) throw new Error('Session request failed: ' + r.status);
        return r.json();
      })
      .then(function(data) {
        if (!data.sessionId) throw new Error('No sessionId in response');
        sessionId = data.sessionId;
        localStorage.setItem(SESSION_KEY, sessionId);
        return fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/messages/' + sessionId);
      })
      .then(function(r) {
        if (!r.ok) return { messages: [] };
        return r.json();
      })
      .then(function(data) {
        if (data.messages && data.messages.length > 0) {
          welcomed = true;
          data.messages.forEach(function(m) {
            addMessage(m.content, m.role === 'user' ? 'jedna-msg-user' : 'jedna-msg-bot');
          });
        } else {
          showWelcome();
        }
      })
      .catch(function(err) {
        console.error('Jedna Chat: session init failed', err);
        addMessage('Unable to connect. Please try again.', 'jedna-msg-bot');
      });
    }

    function send() {
      var text = input.value.trim();
      if (!text || sending) return;
      sending = true;
      sendBtn.disabled = true;
      input.value = '';

      addMessage(text, 'jedna-msg-user');
      var typing = addMessage('Typing...', 'jedna-msg-typing');

      fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, text: text })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        typing.remove();
        if (data.reply) {
          addMessage(data.reply, 'jedna-msg-bot');
          if (data.sessionId) {
            sessionId = data.sessionId;
            localStorage.setItem(SESSION_KEY, sessionId);
          }
        } else if (data.error) {
          addMessage('Sorry, something went wrong. Please try again.', 'jedna-msg-bot');
        }
      })
      .catch(function() {
        typing.remove();
        addMessage('Sorry, we could not connect. Please try again.', 'jedna-msg-bot');
      })
      .finally(function() {
        sending = false;
        sendBtn.disabled = !input.value.trim();
        input.focus();
      });
    }

    // Auto-init session on load if we already have one
    if (sessionId) initSession();
  }

  // ── Load config then build ────────────────────────────────
  fetch(BASE_URL + '/api/webchat/' + TENANT_ID + '/config')
    .then(function(r) { return r.ok ? r.json() : {}; })
    .then(function(data) {
      if (data.primaryColor) cfg.primaryColor = data.primaryColor;
      if (data.headerTitle)  cfg.headerTitle  = data.headerTitle;
      if (data.welcomeMessage) cfg.welcomeMessage = data.welcomeMessage;
      if (data.position)     cfg.position     = data.position;
      if (data.avatarUrl)    cfg.avatarUrl    = data.avatarUrl;
      if (data.bubbleIcon)   cfg.bubbleIcon   = data.bubbleIcon;
    })
    .catch(function() { /* use defaults */ })
    .then(function() { buildWidget(); });
})();
`;
}
