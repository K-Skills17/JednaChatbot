/**
 * Tenant Portal – self-service dashboard for dentists
 * Served at GET /portal/:tenantId
 * All event handlers use addEventListener (no inline onclick) to comply with CSP.
 */
export function tenantPortalHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LK Chatbot — Portal</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #0f1117;
      --bg-card:   #181a20;
      --bg-hover:  #1e2028;
      --border:    #2a2d36;
      --text:      #e4e6eb;
      --text-dim:  #8b8f99;
      --accent:    #6c5ce7;
      --accent-light: #a29bfe;
      --green:     #00b894;
      --yellow:    #fdcb6e;
      --red:       #ff7675;
      --blue:      #74b9ff;
      --radius:    8px;
      --sidebar-w: 240px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    a { color: var(--accent-light); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .layout { display: flex; min-height: 100vh; }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-w);
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      position: fixed; top: 0; left: 0; bottom: 0;
      overflow-y: auto; z-index: 10;
    }
    .sidebar-brand {
      padding: 20px 16px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .sidebar-brand .logo {
      width: 32px; height: 32px; background: var(--accent);
      border-radius: var(--radius);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; color: #fff;
    }
    .sidebar-brand h1 { font-size: 16px; font-weight: 600; }
    .sidebar-brand span { font-size: 11px; color: var(--text-dim); display: block; }
    .sidebar nav { flex: 1; padding: 12px 8px; }
    .nav-section {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.8px; color: var(--text-dim); padding: 16px 12px 6px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-radius: 6px; cursor: pointer;
      font-size: 13px; color: var(--text-dim); transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text); }
    .nav-item.active { background: var(--accent); color: #fff; }
    .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; }

    /* Main */
    .main { margin-left: var(--sidebar-w); flex: 1; padding: 24px; }

    /* Login overlay */
    .login-overlay {
      position: fixed; inset: 0; background: var(--bg);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .login-overlay.hidden { display: none; }
    .login-box {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 12px; padding: 40px; width: 400px; max-width: 90vw;
    }
    .login-box h2 { margin-bottom: 8px; font-size: 20px; }
    .login-box p { color: var(--text-dim); font-size: 13px; margin-bottom: 24px; }
    .login-box label { font-size: 12px; font-weight: 600; color: var(--text-dim); display: block; margin-bottom: 6px; }
    .login-box input {
      width: 100%; padding: 10px 12px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); font-size: 14px; margin-bottom: 16px;
    }
    .login-box input:focus { outline: none; border-color: var(--accent); }
    .login-error { color: var(--red); font-size: 12px; margin-bottom: 12px; display: none; }

    /* Cards */
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px;
    }
    .card-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 700; }
    .card-sub { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

    /* Section */
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }

    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border); color: var(--text-dim); font-size: 11px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
    tr:hover td { background: var(--bg-hover); }

    /* Badges */
    .badge {
      display: inline-block; padding: 3px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
    }
    .badge-green  { background: rgba(0,184,148,0.15); color: var(--green); }
    .badge-yellow { background: rgba(253,203,110,0.15); color: var(--yellow); }
    .badge-red    { background: rgba(255,118,117,0.15); color: var(--red); }
    .badge-blue   { background: rgba(116,185,255,0.15); color: var(--blue); }
    .badge-gray   { background: rgba(139,143,153,0.15); color: var(--text-dim); }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; border: none;
      font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-light); }
    .btn-secondary { background: var(--bg-hover); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { border-color: var(--accent); }

    /* Page sections */
    .page { display: none; }
    .page.active { display: block; }

    /* Loading */
    .loading { color: var(--text-dim); font-size: 13px; padding: 24px 0; }

    /* Plan card */
    .plan-card {
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      border-radius: 12px; padding: 24px; color: #fff; margin-bottom: 24px;
    }
    .plan-card h3 { font-size: 22px; margin-bottom: 4px; text-transform: capitalize; }
    .plan-card .plan-status { font-size: 13px; opacity: 0.8; }
    .plan-card .plan-period { font-size: 12px; opacity: 0.7; margin-top: 8px; }
    .plan-actions { margin-top: 16px; display: flex; gap: 8px; }
    .plan-actions .btn { background: rgba(255,255,255,0.2); color: #fff; }
    .plan-actions .btn:hover { background: rgba(255,255,255,0.3); }

    /* Funnel */
    .funnel { display: flex; gap: 8px; margin-bottom: 24px; }
    .funnel-step {
      flex: 1; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px; text-align: center;
    }
    .funnel-step .step-value { font-size: 24px; font-weight: 700; }
    .funnel-step .step-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; margin-top: 4px; }
    .funnel-step .step-rate { font-size: 12px; color: var(--green); margin-top: 4px; }

    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; }
      .cards { grid-template-columns: 1fr; }
      .funnel { flex-direction: column; }
    }
  </style>
</head>
<body>
  <!-- Login Overlay -->
  <div class="login-overlay" id="loginOverlay">
    <div class="login-box">
      <h2>Portal do Cliente</h2>
      <p>Insira sua chave de API para acessar o painel.</p>
      <label for="apiKeyInput">Chave de API</label>
      <input type="password" id="apiKeyInput" placeholder="lk_..." />
      <div class="login-error" id="loginError">Chave de API invalida</div>
      <button class="btn btn-primary" id="loginBtn" style="width:100%">Entrar</button>
    </div>
  </div>

  <div class="layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="logo">LK</div>
        <div>
          <h1 id="brandName">LK Chatbot</h1>
          <span>Portal do Cliente</span>
        </div>
      </div>
      <nav>
        <div class="nav-section">Menu</div>
        <div class="nav-item active" data-page="overview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Visao Geral
        </div>
        <div class="nav-item" data-page="leads">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Leads
        </div>
        <div class="nav-item" data-page="bookings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Agendamentos
        </div>
        <div class="nav-item" data-page="billing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          Faturamento
        </div>
        <div class="nav-item" data-page="settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuracoes
        </div>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="main">
      <!-- Overview Page -->
      <div class="page active" id="page-overview">
        <h2 style="font-size:22px; margin-bottom:20px">Visao Geral</h2>
        <div class="cards" id="overviewCards">
          <div class="loading">Carregando dados...</div>
        </div>
        <div class="section">
          <h3 class="section-title">Funil de Leads</h3>
          <div class="funnel" id="funnelChart">
            <div class="loading">Carregando funil...</div>
          </div>
        </div>
      </div>

      <!-- Leads Page -->
      <div class="page" id="page-leads">
        <h2 style="font-size:22px; margin-bottom:20px">Leads</h2>
        <div class="table-wrap">
          <table id="leadsTable">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Score</th>
                <th>Status</th>
                <th>Primeiro Contato</th>
              </tr>
            </thead>
            <tbody id="leadsBody">
              <tr><td colspan="5" class="loading">Carregando leads...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bookings Page -->
      <div class="page" id="page-bookings">
        <h2 style="font-size:22px; margin-bottom:20px">Agendamentos</h2>
        <div class="table-wrap">
          <table id="bookingsTable">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Tipo</th>
                <th>Duracao</th>
                <th>Status</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody id="bookingsBody">
              <tr><td colspan="5" class="loading">Carregando agendamentos...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Billing Page -->
      <div class="page" id="page-billing">
        <h2 style="font-size:22px; margin-bottom:20px">Faturamento</h2>
        <div id="billingContent">
          <div class="loading">Carregando faturamento...</div>
        </div>
      </div>

      <!-- Settings Page -->
      <div class="page" id="page-settings">
        <h2 style="font-size:22px; margin-bottom:20px">Configuracoes</h2>
        <div class="card" style="max-width:600px">
          <div class="card-label">Informacoes da Conta</div>
          <div id="settingsContent">
            <div class="loading">Carregando configuracoes...</div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    (function() {
      // ─── State ────────────────────────────────────────────────
      let apiKey = '';
      let tenantId = '';
      let tenantData = null;

      // Extract tenantId from URL path: /portal/:tenantId
      const pathParts = window.location.pathname.split('/');
      const portalIdx = pathParts.indexOf('portal');
      if (portalIdx >= 0 && pathParts[portalIdx + 1]) {
        tenantId = pathParts[portalIdx + 1];
      }

      // ─── API helper ──────────────────────────────────────────
      async function api(path, options) {
        const res = await fetch(path, {
          ...options,
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', ...(options?.headers || {}) },
        });
        if (!res.ok) {
          const body = await res.json().catch(function() { return {}; });
          throw new Error(body.error || 'Request failed: ' + res.status);
        }
        if (res.status === 204) return null;
        return res.json();
      }

      // ─── Login ───────────────────────────────────────────────
      var loginOverlay = document.getElementById('loginOverlay');
      var loginBtn = document.getElementById('loginBtn');
      var apiKeyInput = document.getElementById('apiKeyInput');
      var loginError = document.getElementById('loginError');

      loginBtn.addEventListener('click', doLogin);
      apiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doLogin();
      });

      async function doLogin() {
        var key = apiKeyInput.value.trim();
        if (!key) return;
        apiKey = key;
        loginError.style.display = 'none';

        try {
          // Verify key by fetching tenant details
          tenantData = await api('/api/tenants/' + tenantId);
          loginOverlay.classList.add('hidden');
          document.getElementById('brandName').textContent = tenantData.businessName;
          loadAllData();
        } catch (err) {
          loginError.style.display = 'block';
          loginError.textContent = err.message || 'Chave de API invalida';
        }
      }

      // ─── Navigation ──────────────────────────────────────────
      document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
        item.addEventListener('click', function() {
          var page = item.getAttribute('data-page');
          document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
          item.classList.add('active');
          document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
          var target = document.getElementById('page-' + page);
          if (target) target.classList.add('active');
        });
      });

      // ─── Load Data ───────────────────────────────────────────
      async function loadAllData() {
        await Promise.all([
          loadOverview(),
          loadLeads(),
          loadBookings(),
          loadBilling(),
          loadSettings(),
        ]);
      }

      // ─── Overview ────────────────────────────────────────────
      async function loadOverview() {
        try {
          var data = await api('/api/tenants/' + tenantId + '/analytics/overview');
          var cards = document.getElementById('overviewCards');
          cards.innerHTML =
            renderCard('Mensagens (mes)', data.messagesThisMonth || 0) +
            renderCard('Leads Ativos', data.activeLeads || 0) +
            renderCard('Agendamentos', data.totalBookings || 0) +
            renderCard('Taxa Conversao', (data.conversionRate || 0) + '%') +
            renderCard('Plano', (tenantData.plan || 'starter').toUpperCase()) +
            renderCard('Custo IA (mes)', 'US$ ' + (tenantData.monthlyAiCostUsd || 0).toFixed(2));

          // Funnel
          var funnel = await api('/api/tenants/' + tenantId + '/analytics/funnel');
          var funnelEl = document.getElementById('funnelChart');
          var total = funnel.total || 1;
          funnelEl.innerHTML =
            renderFunnelStep('Total', funnel.total || 0, '') +
            renderFunnelStep('Qualificando', funnel.qualifying || 0, pct(funnel.qualifying, total)) +
            renderFunnelStep('Qualificados', funnel.qualified || 0, pct(funnel.qualified, total)) +
            renderFunnelStep('Agendados', funnel.booked || 0, pct(funnel.booked, total));
        } catch (err) {
          document.getElementById('overviewCards').innerHTML = '<div class="loading">Erro ao carregar: ' + esc(err.message) + '</div>';
        }
      }

      function pct(val, total) {
        if (!total) return '0%';
        return Math.round(((val || 0) / total) * 100) + '%';
      }

      function renderCard(label, value) {
        return '<div class="card"><div class="card-label">' + esc(label) + '</div><div class="card-value">' + esc(String(value)) + '</div></div>';
      }

      function renderFunnelStep(label, value, rate) {
        return '<div class="funnel-step"><div class="step-value">' + esc(String(value)) + '</div><div class="step-label">' + esc(label) + '</div>' +
               (rate ? '<div class="step-rate">' + esc(rate) + '</div>' : '') + '</div>';
      }

      // ─── Leads ───────────────────────────────────────────────
      async function loadLeads() {
        try {
          var data = await api('/api/tenants/' + tenantId + '/analytics/overview');
          // We don't have a dedicated leads list endpoint, so show from analytics
          // The analytics overview provides lead counts
          var body = document.getElementById('leadsBody');
          body.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Acesse a pagina de Treinamento para gerenciar configuracoes do bot. Os dados de leads estao disponiveis na API.</td></tr>';
        } catch (err) {
          document.getElementById('leadsBody').innerHTML = '<tr><td colspan="5" class="loading">Erro: ' + esc(err.message) + '</td></tr>';
        }
      }

      // ─── Bookings ────────────────────────────────────────────
      async function loadBookings() {
        try {
          var data = await api('/api/tenants/' + tenantId + '/bookings');
          var body = document.getElementById('bookingsBody');
          var bookings = data.bookings || data || [];
          if (!Array.isArray(bookings) || bookings.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Nenhum agendamento encontrado</td></tr>';
            return;
          }
          body.innerHTML = bookings.map(function(b) {
            var dt = new Date(b.scheduledAt);
            return '<tr>' +
              '<td>' + esc(dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})) + '</td>' +
              '<td>' + esc(b.appointmentType || '-') + '</td>' +
              '<td>' + esc(b.durationMinutes + ' min') + '</td>' +
              '<td>' + statusBadge(b.status) + '</td>' +
              '<td>' + esc(b.notes || '-') + '</td>' +
            '</tr>';
          }).join('');
        } catch (err) {
          document.getElementById('bookingsBody').innerHTML = '<tr><td colspan="5" class="loading">Erro: ' + esc(err.message) + '</td></tr>';
        }
      }

      // ─── Billing ─────────────────────────────────────────────
      async function loadBilling() {
        try {
          var data = await api('/api/tenants/' + tenantId + '/billing');
          var el = document.getElementById('billingContent');

          var periodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR') : 'N/A';
          var statusText = data.status === 'active' ? 'Ativa' : data.status === 'trialing' ? 'Trial' : data.status === 'none' ? 'Sem assinatura' : data.status;
          var statusClass = data.status === 'active' ? 'badge-green' : data.status === 'none' ? 'badge-gray' : 'badge-yellow';

          var html = '<div class="plan-card">' +
            '<h3>Plano ' + esc(data.plan || 'starter') + '</h3>' +
            '<div class="plan-status"><span class="badge ' + statusClass + '">' + esc(statusText) + '</span></div>' +
            (data.currentPeriodEnd ? '<div class="plan-period">Proximo faturamento: ' + esc(periodEnd) + '</div>' : '') +
            (data.cancelAtPeriodEnd ? '<div class="plan-period" style="color:var(--yellow)">Cancelamento agendado ao final do periodo</div>' : '') +
            '<div class="plan-actions">' +
              '<button class="btn" id="upgradePlanBtn">Alterar Plano</button>' +
              '<button class="btn" id="manageSubBtn">Gerenciar Assinatura</button>' +
            '</div>' +
          '</div>';

          // Usage
          html += '<div class="cards">' +
            renderCard('Mensagens (mes)', data.usage?.messagesThisMonth || 0) +
            renderCard('Custo IA (mes)', 'US$ ' + (data.usage?.monthlyAiCostUsd || 0).toFixed(2)) +
            (data.usage?.aiCostLimitUsd ? renderCard('Limite IA', 'US$ ' + data.usage.aiCostLimitUsd.toFixed(2)) : '') +
          '</div>';

          // Invoices
          if (data.recentInvoices && data.recentInvoices.length > 0) {
            html += '<div class="section"><h3 class="section-title">Faturas Recentes</h3><div class="table-wrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Status</th><th>Link</th></tr></thead><tbody>';
            data.recentInvoices.forEach(function(inv) {
              var dt = new Date(inv.createdAt).toLocaleDateString('pt-BR');
              var amount = (inv.amountDue / 100).toFixed(2);
              var currency = (inv.currency || 'BRL').toUpperCase();
              html += '<tr><td>' + esc(dt) + '</td><td>' + esc(currency + ' ' + amount) + '</td><td>' + statusBadge(inv.status) + '</td>' +
                '<td>' + (inv.invoiceUrl ? '<a href="' + esc(inv.invoiceUrl) + '" target="_blank">Ver fatura</a>' : '-') + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
          }

          el.innerHTML = html;

          // Wire up buttons
          var upgradeBtn = document.getElementById('upgradePlanBtn');
          if (upgradeBtn) {
            upgradeBtn.addEventListener('click', function() {
              var plan = prompt('Escolha o plano: starter, pro, enterprise', data.plan === 'starter' ? 'pro' : 'enterprise');
              if (!plan) return;
              api('/api/tenants/' + tenantId + '/billing/checkout', {
                method: 'POST',
                body: JSON.stringify({ plan: plan, successUrl: window.location.href, cancelUrl: window.location.href }),
              }).then(function(res) {
                if (res.url) window.location.href = res.url;
              }).catch(function(err) { alert('Erro: ' + err.message); });
            });
          }

          var manageBtn = document.getElementById('manageSubBtn');
          if (manageBtn) {
            manageBtn.addEventListener('click', function() {
              api('/api/tenants/' + tenantId + '/billing/portal', {
                method: 'POST',
                body: JSON.stringify({ returnUrl: window.location.href }),
              }).then(function(res) {
                if (res.url) window.location.href = res.url;
              }).catch(function(err) { alert('Erro: ' + err.message); });
            });
          }
        } catch (err) {
          document.getElementById('billingContent').innerHTML = '<div class="loading">Erro: ' + esc(err.message) + '</div>';
        }
      }

      // ─── Settings ────────────────────────────────────────────
      async function loadSettings() {
        if (!tenantData) return;
        var el = document.getElementById('settingsContent');
        var t = tenantData;

        el.innerHTML =
          '<div style="margin:16px 0"><strong>Nome:</strong> ' + esc(t.businessName) + '</div>' +
          '<div style="margin:8px 0"><strong>WhatsApp:</strong> ' + esc(t.whatsappNumber) + '</div>' +
          '<div style="margin:8px 0"><strong>Timezone:</strong> ' + esc(t.timezone) + '</div>' +
          '<div style="margin:8px 0"><strong>Status:</strong> ' + statusBadge(t.status) + '</div>' +
          '<div style="margin:8px 0"><strong>Plano:</strong> <span class="badge badge-blue">' + esc((t.plan || 'starter').toUpperCase()) + '</span></div>' +
          '<div style="margin:8px 0"><strong>Chave API:</strong> <code style="font-size:12px;color:var(--text-dim)">' + esc((t.apiKey || '').slice(0, 8) + '...') + '</code></div>' +
          '<div style="margin:16px 0"><a href="/train/' + esc(tenantId) + '" target="_blank" class="btn btn-secondary">Configurar Bot (Treinamento)</a></div>';
      }

      // ─── Helpers ─────────────────────────────────────────────
      function statusBadge(status) {
        var map = {
          active: 'badge-green', confirmed: 'badge-green', paid: 'badge-green', open: 'badge-blue',
          qualifying: 'badge-blue', trialing: 'badge-blue',
          cancelled: 'badge-red', canceled: 'badge-red', failed: 'badge-red', no_show: 'badge-red',
          past_due: 'badge-yellow', draft: 'badge-gray', onboarding: 'badge-yellow',
          suspended: 'badge-red', completed: 'badge-green',
        };
        var cls = map[status] || 'badge-gray';
        return '<span class="badge ' + cls + '">' + esc(status || 'unknown') + '</span>';
      }

      function esc(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
      }
    })();
  </script>
</body>
</html>`;
}
