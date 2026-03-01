/**
 * Admin Dashboard – single-file HTML served at GET /
 * All event handlers use addEventListener (no inline onclick) to comply with CSP.
 */
export function dashboardHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LK Chatbot — Admin</title>
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
    .sidebar-footer {
      padding: 12px 16px; border-top: 1px solid var(--border);
      font-size: 11px; color: var(--text-dim);
    }
    .status-dot {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; margin-right: 6px;
    }
    .status-dot.ok    { background: var(--green); }
    .status-dot.error { background: var(--red); }
    .status-dot.warn  { background: var(--yellow); }

    /* Main */
    .main { margin-left: var(--sidebar-w); flex: 1; padding: 24px 32px; min-width: 0; }
    .page-header {
      display: flex; align-items: center;
      justify-content: space-between; margin-bottom: 24px;
    }
    .page-header h2 { font-size: 22px; font-weight: 600; }

    /* Auth gate */
    .auth-gate { max-width: 400px; margin: 80px auto; text-align: center; }
    .auth-gate .logo-big {
      width: 56px; height: 56px; background: var(--accent);
      border-radius: 14px;
      display: inline-flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 22px; color: #fff; margin-bottom: 16px;
    }
    .auth-gate h2 { margin-bottom: 8px; }
    .auth-gate p { color: var(--text-dim); font-size: 14px; margin-bottom: 24px; }
    .input-group { display: flex; gap: 8px; }
    .input-group input {
      flex: 1; padding: 10px 14px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: var(--radius);
      color: var(--text); font-size: 14px; outline: none;
    }
    .input-group input:focus { border-color: var(--accent); }
    .auth-error { color: var(--red); font-size: 13px; margin-top: 12px; display: none; }

    /* Buttons */
    .btn {
      padding: 10px 20px; background: var(--accent); color: #fff;
      border: none; border-radius: var(--radius);
      font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-sm { padding: 6px 14px; font-size: 12px; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { border-color: var(--accent); color: var(--accent-light); }

    /* Cards */
    .cards {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px; margin-bottom: 28px;
    }
    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; }
    .card-label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .card-value { font-size: 28px; font-weight: 600; }
    .card-sub { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

    /* Table */
    .table-wrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 28px; }
    .table-title { padding: 14px 18px; font-weight: 600; font-size: 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 18px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); border-bottom: 1px solid var(--border); font-weight: 500; }
    tr:not(:last-child) td { border-bottom: 1px solid var(--border); }
    tr:hover td { background: var(--bg-hover); }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .badge-green  { background: rgba(0,184,148,0.15); color: var(--green); }
    .badge-yellow { background: rgba(253,203,110,0.15); color: var(--yellow); }
    .badge-red    { background: rgba(255,118,117,0.15); color: var(--red); }
    .badge-blue   { background: rgba(116,185,255,0.15); color: var(--blue); }
    .badge-dim    { background: rgba(139,143,153,0.15); color: var(--text-dim); }

    /* Health */
    .health-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; }
    .health-item { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
    .health-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .health-icon.ok    { background: rgba(0,184,148,0.15); }
    .health-icon.error { background: rgba(255,118,117,0.15); }
    .health-icon.skip  { background: rgba(139,143,153,0.15); }
    .health-label { font-size: 13px; font-weight: 500; }
    .health-status { font-size: 11px; color: var(--text-dim); }

    /* Pages */
    .page { display: none; }
    .page.active { display: block; }

    /* Spinner / empty */
    .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-state { text-align: center; padding: 48px 20px; color: var(--text-dim); font-size: 14px; }

    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; width: 90%; max-width: 480px; padding: 24px; }
    .modal h3 { margin-bottom: 16px; font-size: 16px; }
    .form-field { margin-bottom: 14px; }
    .form-field label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
    .form-field input, .form-field select, .form-field textarea {
      width: 100%; padding: 9px 12px; background: var(--bg);
      border: 1px solid var(--border); border-radius: 6px;
      color: var(--text); font-size: 13px; font-family: inherit; outline: none;
    }
    .form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: var(--accent); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }

    @media (max-width: 768px) {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 16px; }
      .cards { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>

<!-- AUTH GATE -->
<div id="auth-gate" class="auth-gate">
  <div class="logo-big">LK</div>
  <h2>LK Chatbot Admin</h2>
  <p>Enter your API key to access the dashboard.</p>
  <div class="input-group">
    <input id="api-key-input" type="password" placeholder="API Key" />
    <button class="btn" id="btn-connect">Connect</button>
  </div>
  <div id="auth-error" class="auth-error">Invalid API key. Check and try again.</div>
</div>

<!-- DASHBOARD -->
<div id="dashboard" class="layout" style="display:none">
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="logo">LK</div>
      <div><h1>LK Chatbot</h1><span>Admin Dashboard</span></div>
    </div>
    <nav>
      <div class="nav-section">Main</div>
      <div class="nav-item active" data-page="overview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Overview
      </div>
      <div class="nav-item" data-page="tenants">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Tenants
      </div>
      <div class="nav-item" data-page="campaigns">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Campaigns
      </div>
      <div class="nav-section">System</div>
      <div class="nav-item" data-page="health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Health &amp; Status
      </div>
      <div class="nav-item" data-page="api">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        API Reference
      </div>
    </nav>
    <div class="sidebar-footer">
      <span class="status-dot ok" id="sidebar-status"></span>
      <span id="sidebar-status-text">System Online</span>
    </div>
  </aside>

  <main class="main">

    <!-- OVERVIEW -->
    <div id="page-overview" class="page active">
      <div class="page-header">
        <h2>Overview</h2>
        <button class="btn btn-sm btn-outline" id="btn-refresh">Refresh</button>
      </div>
      <div class="cards">
        <div class="card"><div class="card-label">Total Tenants</div><div class="card-value" id="stat-tenants">&mdash;</div></div>
        <div class="card"><div class="card-label">Active Campaigns</div><div class="card-value" id="stat-campaigns">&mdash;</div></div>
        <div class="card"><div class="card-label">Uptime</div><div class="card-value" id="stat-uptime">&mdash;</div><div class="card-sub" id="stat-uptime-sub"></div></div>
        <div class="card"><div class="card-label">System Status</div><div class="card-value" id="stat-status">&mdash;</div></div>
      </div>
      <div class="health-grid" id="overview-health"></div>
      <div class="table-wrap">
        <div class="table-title">Recent Tenants <button class="btn btn-sm btn-outline" id="btn-view-all-tenants">View all</button></div>
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Plan</th><th>Status</th><th>Created</th></tr></thead>
          <tbody id="overview-tenants-body"><tr><td colspan="5" class="empty-state"><div class="spinner"></div></td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- TENANTS -->
    <div id="page-tenants" class="page">
      <div class="page-header">
        <h2>Tenants</h2>
        <button class="btn btn-sm" id="btn-new-tenant">+ New Tenant</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Plan</th><th>WhatsApp</th><th>AI Provider</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody id="tenants-body"><tr><td colspan="7" class="empty-state"><div class="spinner"></div></td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- CAMPAIGNS -->
    <div id="page-campaigns" class="page">
      <div class="page-header"><h2>Campaigns</h2></div>
      <p style="color:var(--text-dim);font-size:14px;margin-bottom:16px">Select a tenant to view campaigns, or browse by tenant below.</p>
      <div id="campaigns-content"><div class="empty-state"><div class="spinner"></div></div></div>
    </div>

    <!-- HEALTH -->
    <div id="page-health" class="page">
      <div class="page-header">
        <h2>Health &amp; Status</h2>
        <button class="btn btn-sm btn-outline" id="btn-refresh-health">Refresh</button>
      </div>
      <div class="health-grid" id="health-details"></div>
      <div class="table-wrap">
        <div class="table-title">System Info</div>
        <table><tbody id="health-info-body"></tbody></table>
      </div>
    </div>

    <!-- API REFERENCE -->
    <div id="page-api" class="page">
      <div class="page-header"><h2>API Reference</h2></div>
      <div class="table-wrap">
        <div class="table-title">Available Endpoints</div>
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><span class="badge badge-green">GET</span></td><td>/health</td><td>Basic health check</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/health/ready</td><td>Readiness check (DB, Redis, Evolution)</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants</td><td>Create a new tenant</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants</td><td>List all tenants</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId</td><td>Get tenant details</td></tr>
            <tr><td><span class="badge badge-yellow">PATCH</span></td><td>/api/tenants/:tenantId</td><td>Update a tenant</td></tr>
            <tr><td><span class="badge badge-red">DELETE</span></td><td>/api/tenants/:tenantId</td><td>Delete a tenant</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/connect</td><td>Initiate WhatsApp connection (QR code)</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/status</td><td>WhatsApp connection status</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/webhook</td><td>Setup/reconfigure webhook</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/bookings</td><td>Create a booking</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/bookings</td><td>List bookings (filter by status/date)</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/bookings/slots</td><td>Available booking slots</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/bookings/:id/cancel</td><td>Cancel a booking</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/bookings/:id/reschedule</td><td>Reschedule a booking</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/calendar/auth</td><td>Google Calendar OAuth flow</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/campaigns</td><td>Create a campaign</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/campaigns</td><td>List campaigns</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/campaigns/:id</td><td>Get campaign details</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/campaigns/:id/contacts</td><td>Add contacts to campaign</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/campaigns/:id/start</td><td>Start a campaign</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/tenants/:tenantId/campaigns/:id/pause</td><td>Pause a campaign</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/campaigns/:id/analytics</td><td>Campaign analytics</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/analytics/overview</td><td>Dashboard overview metrics</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/analytics/funnel</td><td>Lead funnel analytics</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/tenants/:tenantId/analytics/daily</td><td>Daily time-series metrics</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/train/:tenantId</td><td>Training dashboard (no auth)</td></tr>
            <tr><td><span class="badge badge-green">GET</span></td><td>/api/training/template</td><td>Download training template JSON</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/api/training/:tenantId</td><td>Save training configuration</td></tr>
            <tr><td><span class="badge badge-blue">POST</span></td><td>/webhook/evolution</td><td>Evolution API webhook receiver</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>
</div>

<!-- NEW TENANT MODAL -->
<div class="modal-overlay" id="new-tenant-modal">
  <div class="modal">
    <h3>Create New Tenant</h3>
    <div class="form-field"><label>Business Name *</label><input id="nt-name" placeholder="Clinica Dental SP" /></div>
    <div class="form-field"><label>WhatsApp Number *</label><input id="nt-phone" placeholder="5511999998888" /></div>
    <div class="form-field"><label>Plan</label>
      <select id="nt-plan"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select>
    </div>
    <div class="form-field"><label>AI Provider</label>
      <select id="nt-ai"><option value="claude">Claude</option><option value="openai">OpenAI</option></select>
    </div>
    <div id="nt-error" style="color:var(--red);font-size:13px;display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-sm btn-outline" id="btn-cancel-tenant">Cancel</button>
      <button class="btn btn-sm" id="btn-create-tenant">Create</button>
    </div>
  </div>
</div>

<script>
  // ── State ─────────────────────────────────────────
  var API_KEY = '';

  // ── Helpers ───────────────────────────────────────
  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json', 'x-api-key': API_KEY }, opts.headers || {});
    return fetch(path, opts);
  }

  // ── Auth ──────────────────────────────────────────
  function authenticate() {
    var key = document.getElementById('api-key-input').value.trim();
    if (!key) return;
    API_KEY = key;
    apiFetch('/api/tenants?page=1&limit=1')
      .then(function(res) {
        if (res.ok) {
          sessionStorage.setItem('lk_api_key', key);
          document.getElementById('auth-gate').style.display = 'none';
          document.getElementById('dashboard').style.display = 'flex';
          refreshAll();
        } else {
          document.getElementById('auth-error').style.display = 'block';
        }
      })
      .catch(function() {
        document.getElementById('auth-error').style.display = 'block';
      });
  }

  // ── Navigation ────────────────────────────────────
  function showPage(name) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    var page = document.getElementById('page-' + name);
    var nav = document.querySelector('[data-page="' + name + '"]');
    if (page) page.classList.add('active');
    if (nav) nav.classList.add('active');
    if (name === 'tenants') loadTenants();
    if (name === 'campaigns') loadAllCampaigns();
    if (name === 'health') loadHealth();
  }

  // ── Refresh ───────────────────────────────────────
  function refreshAll() {
    loadOverview();
    loadTenants();
  }

  // ── Overview ──────────────────────────────────────
  function loadOverview() {
    fetch('/health/ready').then(function(r) { return r.json(); }).then(function(data) {
      renderHealthGrid('overview-health', data.checks || {});
      var el = document.getElementById('stat-status');
      el.textContent = data.status === 'ready' ? 'Healthy' : 'Degraded';
      el.style.color = data.status === 'ready' ? 'var(--green)' : 'var(--yellow)';
      var dot = document.getElementById('sidebar-status');
      dot.className = 'status-dot ' + (data.status === 'ready' ? 'ok' : 'warn');
      document.getElementById('sidebar-status-text').textContent = data.status === 'ready' ? 'System Online' : 'Degraded';
    }).catch(function() {});

    fetch('/health').then(function(r) { return r.json(); }).then(function(data) {
      var secs = Math.floor(data.uptime);
      var hrs = Math.floor(secs / 3600);
      var mins = Math.floor((secs % 3600) / 60);
      document.getElementById('stat-uptime').textContent = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';
      document.getElementById('stat-uptime-sub').textContent = 'Since ' + new Date(Date.now() - secs * 1000).toLocaleString();
    }).catch(function() {});

    apiFetch('/api/tenants?page=1&limit=5').then(function(r) { return r.json(); }).then(function(data) {
      document.getElementById('stat-tenants').textContent = data.total != null ? data.total : (data.data ? data.data.length : '—');
      renderTenantRows('overview-tenants-body', (data.data || []).slice(0, 5), true);
    }).catch(function() {});

    document.getElementById('stat-campaigns').textContent = '—';
  }

  // ── Tenants ───────────────────────────────────────
  var tenantsCache = [];

  function loadTenants() {
    apiFetch('/api/tenants?page=1&limit=50').then(function(r) { return r.json(); }).then(function(data) {
      tenantsCache = data.data || [];
      renderTenantRows('tenants-body', tenantsCache, false);
      document.getElementById('stat-tenants').textContent = data.total != null ? data.total : tenantsCache.length;

      var campaignCount = 0;
      var promises = tenantsCache.slice(0, 10).map(function(t) {
        return apiFetch('/api/tenants/' + t.id + '/campaigns')
          .then(function(r) { return r.json(); })
          .then(function(cd) {
            var list = cd.data || cd || [];
            list.forEach(function(c) {
              if (c.status === 'ACTIVE' || c.status === 'SENDING') campaignCount++;
            });
          }).catch(function() {});
      });
      Promise.all(promises).then(function() {
        document.getElementById('stat-campaigns').textContent = campaignCount;
      });
    }).catch(function() {
      document.getElementById('tenants-body').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load tenants.</td></tr>';
    });
  }

  function renderTenantRows(tbodyId, tenants, compact) {
    var tbody = document.getElementById(tbodyId);
    if (!tenants.length) {
      var cols = compact ? 5 : 7;
      tbody.innerHTML = '<tr><td colspan="' + cols + '" class="empty-state">No tenants found. Create one to get started.</td></tr>';
      return;
    }
    tbody.innerHTML = tenants.map(function(t) {
      var plan = (t.plan || 'starter').toLowerCase();
      var planBadge = plan === 'enterprise' ? 'badge-blue' : plan === 'pro' ? 'badge-green' : 'badge-dim';
      var date = new Date(t.createdAt).toLocaleDateString();
      if (compact) {
        return '<tr>'
          + '<td>' + esc(t.businessName || t.name || '—') + '</td>'
          + '<td>' + esc(t.whatsappNumber || t.phone || '—') + '</td>'
          + '<td><span class="badge ' + planBadge + '">' + esc(plan) + '</span></td>'
          + '<td><span class="badge ' + (t.active !== false ? 'badge-green' : 'badge-red') + '">' + (t.active !== false ? 'Active' : 'Inactive') + '</span></td>'
          + '<td>' + date + '</td></tr>';
      }
      return '<tr>'
        + '<td><strong>' + esc(t.businessName || t.name || '—') + '</strong></td>'
        + '<td>' + esc(t.whatsappNumber || t.phone || '—') + '</td>'
        + '<td><span class="badge ' + planBadge + '">' + esc(plan) + '</span></td>'
        + '<td><span class="badge ' + (t.whatsappConnected ? 'badge-green' : 'badge-dim') + '">' + (t.whatsappConnected ? 'Connected' : 'Disconnected') + '</span></td>'
        + '<td>' + esc(t.aiProvider || '—') + '</td>'
        + '<td>' + date + '</td>'
        + '<td>'
        + '<a href="/train/' + t.id + '" target="_blank" style="margin-right:8px">Train</a>'
        + '<a href="#" data-delete-tenant="' + t.id + '" style="color:var(--red)">Delete</a>'
        + '</td></tr>';
    }).join('');
  }

  // ── Campaigns ─────────────────────────────────────
  function loadAllCampaigns() {
    var container = document.getElementById('campaigns-content');
    if (!tenantsCache.length) {
      container.innerHTML = '<div class="empty-state">No tenants found. Create a tenant first.</div>';
      return;
    }
    var html = '';
    var promises = tenantsCache.map(function(t) {
      return apiFetch('/api/tenants/' + t.id + '/campaigns')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var campaigns = data.data || data || [];
          if (!campaigns.length) return;
          var section = '<div class="table-wrap"><div class="table-title">' + esc(t.businessName || t.name) + '</div>'
            + '<table><thead><tr><th>Name</th><th>Status</th><th>Contacts</th><th>Sent</th><th>Created</th></tr></thead><tbody>';
          campaigns.forEach(function(c) {
            var sb = c.status === 'ACTIVE' || c.status === 'SENDING' ? 'badge-green' : c.status === 'PAUSED' ? 'badge-yellow' : c.status === 'DRAFT' ? 'badge-dim' : 'badge-blue';
            section += '<tr>'
              + '<td>' + esc(c.name || '—') + '</td>'
              + '<td><span class="badge ' + sb + '">' + esc(c.status || '—') + '</span></td>'
              + '<td>' + (c.totalContacts != null ? c.totalContacts : '—') + '</td>'
              + '<td>' + (c.sentCount != null ? c.sentCount : '—') + '</td>'
              + '<td>' + new Date(c.createdAt).toLocaleDateString() + '</td></tr>';
          });
          section += '</tbody></table></div>';
          html += section;
        }).catch(function() {});
    });
    Promise.all(promises).then(function() {
      container.innerHTML = html || '<div class="empty-state">No campaigns found across tenants.</div>';
    });
  }

  // ── Health ────────────────────────────────────────
  function loadHealth() {
    Promise.all([
      fetch('/health/ready').then(function(r) { return r.json(); }),
      fetch('/health').then(function(r) { return r.json(); })
    ]).then(function(results) {
      var ready = results[0];
      var health = results[1];
      renderHealthGrid('health-details', ready.checks || {});
      var secs = Math.floor(health.uptime);
      var hrs = Math.floor(secs / 3600);
      var mins = Math.floor((secs % 3600) / 60);
      var rows = [
        ['Status', ready.status || '—'],
        ['Uptime', (hrs > 0 ? hrs + 'h ' : '') + mins + 'm ' + (secs % 60) + 's'],
        ['Webhook URL', (ready.config && ready.config.webhookUrl) || '—'],
        ['Evolution URL', (ready.config && ready.config.evolutionUrl) || '—'],
        ['AI Provider', (ready.config && ready.config.aiProvider) || '—'],
        ['Timestamp', health.timestamp || '—'],
      ];
      document.getElementById('health-info-body').innerHTML = rows.map(function(r) {
        return '<tr><td style="color:var(--text-dim);width:180px">' + r[0] + '</td><td>' + esc(String(r[1])) + '</td></tr>';
      }).join('');
    }).catch(function() {
      document.getElementById('health-details').innerHTML = '<div class="empty-state">Failed to load health data.</div>';
    });
  }

  function renderHealthGrid(containerId, checks) {
    var icons = { database: '&#128450;', redis: '&#9889;', evolution: '&#128172;' };
    var labels = { database: 'Database', redis: 'Redis', evolution: 'Evolution API' };
    document.getElementById(containerId).innerHTML = Object.entries(checks).map(function(entry) {
      var key = entry[0], val = entry[1];
      var cls = val === 'ok' ? 'ok' : val === 'error' ? 'error' : 'skip';
      var statusText = val === 'ok' ? 'Connected' : val === 'error' ? 'Error' : 'Skipped';
      return '<div class="health-item">'
        + '<div class="health-icon ' + cls + '">' + (icons[key] || '&#9679;') + '</div>'
        + '<div><div class="health-label">' + (labels[key] || key) + '</div>'
        + '<div class="health-status">' + statusText + '</div></div></div>';
    }).join('');
  }

  // ── Tenant CRUD ───────────────────────────────────
  function openNewTenantModal() {
    document.getElementById('new-tenant-modal').classList.add('open');
    document.getElementById('nt-error').style.display = 'none';
  }

  function closeNewTenantModal() {
    document.getElementById('new-tenant-modal').classList.remove('open');
  }

  function createTenant() {
    var name = document.getElementById('nt-name').value.trim();
    var phone = document.getElementById('nt-phone').value.trim();
    var plan = document.getElementById('nt-plan').value;
    var ai = document.getElementById('nt-ai').value;
    if (!name || !phone) {
      var err = document.getElementById('nt-error');
      err.textContent = 'Business name and WhatsApp number are required.';
      err.style.display = 'block';
      return;
    }
    apiFetch('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({ businessName: name, whatsappNumber: phone, plan: plan, aiConfig: { model: ai } }),
    }).then(function(res) {
      if (res.ok) {
        closeNewTenantModal();
        loadTenants();
        loadOverview();
      } else {
        return res.json().then(function(data) {
          var err = document.getElementById('nt-error');
          err.textContent = data.error || 'Failed to create tenant.';
          err.style.display = 'block';
        });
      }
    }).catch(function() {
      var err = document.getElementById('nt-error');
      err.textContent = 'Network error. Try again.';
      err.style.display = 'block';
    });
  }

  function deleteTenant(id) {
    if (!confirm('Are you sure you want to delete this tenant? This cannot be undone.')) return;
    apiFetch('/api/tenants/' + id, { method: 'DELETE' })
      .then(function() { loadTenants(); loadOverview(); })
      .catch(function() { alert('Failed to delete tenant.'); });
  }

  // ── Event Listeners (no inline handlers) ──────────
  document.getElementById('btn-connect').addEventListener('click', authenticate);

  document.getElementById('api-key-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authenticate();
  });

  document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
    item.addEventListener('click', function() {
      showPage(item.getAttribute('data-page'));
    });
  });

  document.getElementById('btn-refresh').addEventListener('click', refreshAll);
  document.getElementById('btn-view-all-tenants').addEventListener('click', function() { showPage('tenants'); });
  document.getElementById('btn-new-tenant').addEventListener('click', openNewTenantModal);
  document.getElementById('btn-refresh-health').addEventListener('click', loadHealth);
  document.getElementById('btn-cancel-tenant').addEventListener('click', closeNewTenantModal);
  document.getElementById('btn-create-tenant').addEventListener('click', createTenant);

  // Delegate clicks for dynamically-rendered delete links
  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-delete-tenant]');
    if (target) {
      e.preventDefault();
      deleteTenant(target.getAttribute('data-delete-tenant'));
    }
  });

  // ── Restore session on load ───────────────────────
  (function() {
    var saved = sessionStorage.getItem('lk_api_key');
    if (saved) {
      API_KEY = saved;
      document.getElementById('auth-gate').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';
      refreshAll();
    }
  })();
</script>
</body>
</html>`;
}
