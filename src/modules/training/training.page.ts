/**
 * Self-contained training dashboard HTML page.
 * Served at /train/:tenantId — no build step needed.
 */
export function trainingPageHtml(tenantId: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LK Chatbot — Treinamento</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #1a1a2e; line-height: 1.6; }

    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 24px 0; text-align: center; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header p { opacity: 0.85; font-size: 14px; margin-top: 4px; }

    .container { max-width: 800px; margin: 0 auto; padding: 24px 16px 80px; }

    /* Auth bar */
    .auth-bar { background: #fff; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .auth-bar label { font-weight: 600; font-size: 14px; white-space: nowrap; }
    .auth-bar input { flex: 1; min-width: 200px; }
    .auth-bar .btn-load { white-space: nowrap; }

    /* Cards */
    .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 18px; margin-bottom: 4px; color: #333; }
    .card .subtitle { font-size: 13px; color: #888; margin-bottom: 16px; }

    /* Form elements */
    label.field-label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #555; }
    input[type="text"], input[type="password"], textarea, select {
      width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px;
      font-family: inherit; transition: border-color 0.2s;
    }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.12); }
    textarea { resize: vertical; min-height: 80px; }
    .field { margin-bottom: 16px; }

    /* Dynamic lists */
    .list-section { margin-top: 8px; }
    .list-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px; position: relative; }
    .list-item .remove-btn { position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
    .list-item .remove-btn:hover { background: #fef2f2; }
    .list-item .row { display: flex; gap: 8px; margin-bottom: 6px; }
    .list-item .row:last-child { margin-bottom: 0; }
    .list-item input, .list-item textarea { font-size: 13px; padding: 8px 10px; }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: #667eea; color: #fff; }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-secondary { background: #f3f4f6; color: #374151; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-add { background: none; border: 1px dashed #cbd5e1; color: #64748b; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; width: 100%; }
    .btn-add:hover { border-color: #667eea; color: #667eea; background: #f8f9ff; }
    .btn-sm { padding: 6px 12px; font-size: 13px; }

    /* Upload area */
    .upload-area { border: 2px dashed #d1d5db; border-radius: 12px; padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 16px; }
    .upload-area:hover, .upload-area.dragover { border-color: #667eea; background: #f8f9ff; }
    .upload-area p { color: #6b7280; font-size: 14px; }
    .upload-area .icon { font-size: 32px; margin-bottom: 8px; display: block; }
    .upload-area input[type="file"] { display: none; }

    /* Tags input */
    .tags-container { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid #ddd; border-radius: 8px; min-height: 42px; cursor: text; }
    .tags-container:focus-within { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.12); }
    .tag { display: inline-flex; align-items: center; gap: 4px; background: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 6px; font-size: 13px; }
    .tag button { background: none; border: none; color: #6366f1; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .tags-input { border: none; outline: none; flex: 1; min-width: 100px; font-size: 14px; padding: 4px; }

    /* Toast */
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 14px 24px; border-radius: 10px; color: #fff; font-weight: 600; font-size: 14px; z-index: 1000; transform: translateY(100px); opacity: 0; transition: all 0.3s ease; }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { background: #10b981; }
    .toast.error { background: #ef4444; }

    /* Actions bar */
    .actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }

    /* Responsive */
    @media (max-width: 640px) {
      .list-item .row { flex-direction: column; }
      .actions { flex-direction: column; }
      .actions .btn { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>

<div class="header">
  <h1>LK Chatbot — Treinamento</h1>
  <p>Configure o que seu chatbot sabe, como ele fala e como qualifica leads</p>
</div>

<div class="container">

  <!-- Auth -->
  <div class="auth-bar">
    <label for="apiKey">API Key:</label>
    <input type="password" id="apiKey" placeholder="Sua API key para autenticar">
    <button class="btn btn-primary btn-load btn-sm" onclick="loadExisting()">Carregar dados</button>
  </div>

  <!-- Upload Template -->
  <div class="card">
    <h2>Importar Configuracao</h2>
    <p class="subtitle">Faca upload de um template JSON preenchido ou <a href="/api/training/template" style="color:#667eea;">baixe o template vazio</a></p>
    <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
      <span class="icon">&#128196;</span>
      <p>Arraste um arquivo JSON aqui ou clique para selecionar</p>
      <input type="file" id="fileInput" accept=".json,.txt">
    </div>
  </div>

  <!-- Business Info -->
  <div class="card">
    <h2>Sobre o Negocio</h2>
    <p class="subtitle">Informacoes basicas que o bot usa para se apresentar</p>

    <div class="field">
      <label class="field-label">Descricao do negocio</label>
      <textarea id="businessDescription" rows="3" placeholder="Ex: Clinica odontologica especializada em implantes e estetica dental, localizada na Av. Paulista, Sao Paulo."></textarea>
    </div>

    <div class="field">
      <label class="field-label">Publico-alvo</label>
      <input type="text" id="targetAudience" placeholder="Ex: Adultos de 25-60 anos buscando tratamentos esteticos dentarios">
    </div>

    <div class="field">
      <label class="field-label">Tom de voz</label>
      <select id="tone">
        <option value="friendly" selected>Amigavel (Recomendado)</option>
        <option value="casual">Casual</option>
        <option value="formal">Formal</option>
      </select>
    </div>

    <div class="field">
      <label class="field-label">Mensagem de saudacao</label>
      <input type="text" id="greeting" placeholder="Ex: Ola! Bem-vindo a Clinica LK! Como posso ajudar?">
    </div>

    <div class="field">
      <label class="field-label">Mensagem de encerramento</label>
      <input type="text" id="closingMessage" placeholder="Ex: Obrigado pelo contato! Qualquer duvida, estamos a disposicao!">
    </div>
  </div>

  <!-- Services -->
  <div class="card">
    <h2>Servicos / Produtos</h2>
    <p class="subtitle">O bot so vai mencionar os servicos listados aqui — nao inventa nada</p>
    <div class="list-section" id="servicesList"></div>
    <button class="btn-add" onclick="addService()">+ Adicionar servico</button>
  </div>

  <!-- FAQ -->
  <div class="card">
    <h2>Perguntas Frequentes (FAQ)</h2>
    <p class="subtitle">Respostas prontas para perguntas comuns — o bot usa estas respostas como base</p>
    <div class="list-section" id="faqList"></div>
    <button class="btn-add" onclick="addFaq()">+ Adicionar pergunta</button>
  </div>

  <!-- Qualification -->
  <div class="card">
    <h2>Criterios de Qualificacao</h2>
    <p class="subtitle">O que faz um lead ser qualificado? O bot vai tentar descobrir essas informacoes na conversa</p>
    <div class="list-section" id="criteriaList"></div>
    <button class="btn-add" onclick="addCriterion()">+ Adicionar criterio</button>
  </div>

  <!-- Rules -->
  <div class="card">
    <h2>Regras e Restricoes</h2>
    <p class="subtitle">Controle o que o bot pode e nao pode fazer</p>

    <div class="field">
      <label class="field-label">Topicos proibidos (Enter para adicionar)</label>
      <div class="tags-container" id="forbiddenTagsContainer" onclick="document.getElementById('forbiddenInput').focus()">
        <input type="text" class="tags-input" id="forbiddenInput" placeholder="Ex: politica, religiao, concorrentes...">
      </div>
    </div>

    <div class="field">
      <label class="field-label">Regras de escalacao (quando passar para humano)</label>
      <textarea id="escalationRules" rows="2" placeholder="Ex: Quando o cliente pedir desconto acima de 20% ou reclamar de servico anterior"></textarea>
    </div>

    <div class="field">
      <label class="field-label">Instrucoes extras (prompt livre — para usuarios avancados)</label>
      <textarea id="systemPrompt" rows="3" placeholder="Instrucoes adicionais em texto livre que serao incluidas no prompt do bot..."></textarea>
    </div>
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="btn btn-secondary" onclick="downloadConfig()">Exportar JSON</button>
    <button class="btn btn-primary" onclick="saveTraining()">Salvar Treinamento</button>
  </div>

</div>

<div class="toast" id="toast"></div>

<script>
const TENANT_ID = '${tenantId}';
let forbiddenTopics = [];

// ── Toast ─────────────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Load existing config from API ─────────────────────
async function loadExisting() {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { showToast('Informe a API key', 'error'); return; }
  try {
    const res = await fetch('/api/tenants/' + TENANT_ID, { headers: { 'x-api-key': key } });
    if (!res.ok) throw new Error('Nao encontrado ou nao autorizado');
    const tenant = await res.json();
    populateForm(tenant.aiConfig || {});
    showToast('Configuracao carregada!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Populate form from config object ──────────────────
function populateForm(cfg) {
  document.getElementById('businessDescription').value = cfg.businessDescription || '';
  document.getElementById('targetAudience').value = cfg.targetAudience || '';
  document.getElementById('tone').value = cfg.tone || 'friendly';
  document.getElementById('greeting').value = cfg.greeting || '';
  document.getElementById('closingMessage').value = cfg.closingMessage || '';
  document.getElementById('escalationRules').value = cfg.escalationRules || '';
  document.getElementById('systemPrompt').value = cfg.systemPrompt || '';

  // Services
  document.getElementById('servicesList').innerHTML = '';
  (cfg.services || []).forEach(s => addService(s));

  // FAQ
  document.getElementById('faqList').innerHTML = '';
  (cfg.faq || []).forEach(f => addFaq(f));

  // Qualification criteria
  document.getElementById('criteriaList').innerHTML = '';
  (cfg.qualificationCriteria || []).forEach(c => addCriterion(c));

  // Forbidden topics
  forbiddenTopics = cfg.forbiddenTopics || [];
  renderTags();
}

// ── Services ──────────────────────────────────────────
function addService(data) {
  const el = document.createElement('div');
  el.className = 'list-item';
  el.innerHTML = \`
    <button class="remove-btn" onclick="this.parentElement.remove()">&times;</button>
    <div class="row">
      <input type="text" class="svc-name" placeholder="Nome do servico" value="\${esc(data?.name)}">
      <input type="text" class="svc-price" placeholder="Preco (ex: R$ 150)" value="\${esc(data?.price)}" style="max-width:160px;">
    </div>
    <div class="row">
      <input type="text" class="svc-desc" placeholder="Descricao breve" value="\${esc(data?.description)}">
    </div>\`;
  document.getElementById('servicesList').appendChild(el);
}

// ── FAQ ───────────────────────────────────────────────
function addFaq(data) {
  const el = document.createElement('div');
  el.className = 'list-item';
  el.innerHTML = \`
    <button class="remove-btn" onclick="this.parentElement.remove()">&times;</button>
    <div class="row">
      <input type="text" class="faq-q" placeholder="Pergunta" value="\${esc(data?.question)}">
    </div>
    <div class="row">
      <textarea class="faq-a" rows="2" placeholder="Resposta">\${esc(data?.answer)}</textarea>
    </div>\`;
  document.getElementById('faqList').appendChild(el);
}

// ── Qualification Criteria ────────────────────────────
function addCriterion(data) {
  const el = document.createElement('div');
  el.className = 'list-item';
  const label = typeof data === 'string' ? data : (data?.label || '');
  const weight = data?.weight ?? 2;
  el.innerHTML = \`
    <button class="remove-btn" onclick="this.parentElement.remove()">&times;</button>
    <div class="row">
      <input type="text" class="crit-label" placeholder="Ex: Tipo de tratamento desejado" value="\${esc(label)}">
      <select class="crit-weight" style="max-width:120px;">
        <option value="1" \${weight==1?'selected':''}>Peso 1</option>
        <option value="2" \${weight==2?'selected':''}>Peso 2</option>
        <option value="3" \${weight==3?'selected':''}>Peso 3</option>
      </select>
    </div>\`;
  document.getElementById('criteriaList').appendChild(el);
}

// ── Tags (forbidden topics) ───────────────────────────
function renderTags() {
  const container = document.getElementById('forbiddenTagsContainer');
  container.querySelectorAll('.tag').forEach(t => t.remove());
  const input = document.getElementById('forbiddenInput');
  forbiddenTopics.forEach((t, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = t + ' <button onclick="removeTag(' + i + ')">&times;</button>';
    container.insertBefore(tag, input);
  });
}
function removeTag(i) { forbiddenTopics.splice(i, 1); renderTags(); }

document.getElementById('forbiddenInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = this.value.trim().replace(/,/g, '');
    if (val && !forbiddenTopics.includes(val)) { forbiddenTopics.push(val); renderTags(); }
    this.value = '';
  }
});

// ── Collect form data ─────────────────────────────────
function collectConfig() {
  const cfg = {};

  cfg.businessDescription = document.getElementById('businessDescription').value.trim();
  cfg.targetAudience = document.getElementById('targetAudience').value.trim();
  cfg.tone = document.getElementById('tone').value;
  cfg.greeting = document.getElementById('greeting').value.trim();
  cfg.closingMessage = document.getElementById('closingMessage').value.trim();
  cfg.escalationRules = document.getElementById('escalationRules').value.trim();
  cfg.systemPrompt = document.getElementById('systemPrompt').value.trim();

  cfg.services = [...document.querySelectorAll('#servicesList .list-item')].map(el => ({
    name: el.querySelector('.svc-name').value.trim(),
    description: el.querySelector('.svc-desc').value.trim(),
    price: el.querySelector('.svc-price').value.trim(),
  })).filter(s => s.name);

  cfg.faq = [...document.querySelectorAll('#faqList .list-item')].map(el => ({
    question: el.querySelector('.faq-q').value.trim(),
    answer: el.querySelector('.faq-a').value.trim(),
  })).filter(f => f.question && f.answer);

  cfg.qualificationCriteria = [...document.querySelectorAll('#criteriaList .list-item')].map(el => ({
    label: el.querySelector('.crit-label').value.trim(),
    weight: parseInt(el.querySelector('.crit-weight').value),
  })).filter(c => c.label);

  cfg.forbiddenTopics = [...forbiddenTopics];

  // Remove empty strings
  Object.keys(cfg).forEach(k => { if (cfg[k] === '') delete cfg[k]; });

  return cfg;
}

// ── Save ──────────────────────────────────────────────
async function saveTraining() {
  const key = document.getElementById('apiKey').value.trim();
  if (!key) { showToast('Informe a API key primeiro', 'error'); return; }

  const config = collectConfig();
  try {
    const res = await fetch('/api/training/' + TENANT_ID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(config),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro ao salvar'); }
    showToast('Treinamento salvo com sucesso!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Export config as JSON file ────────────────────────
function downloadConfig() {
  const config = collectConfig();
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'training-config.json';
  a.click();
}

// ── File upload ───────────────────────────────────────
document.getElementById('fileInput').addEventListener('change', handleFileUpload);

const uploadArea = document.getElementById('uploadArea');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

function handleFileUpload(e) { if (e.target.files.length) handleFile(e.target.files[0]); }
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const cfg = JSON.parse(e.target.result);
      // Remove instruction keys
      delete cfg._instructions;
      populateForm(cfg);
      showToast('Template importado!', 'success');
    } catch {
      showToast('Arquivo JSON invalido', 'error');
    }
  };
  reader.readAsText(file);
}

// ── Escape helper ─────────────────────────────────────
function esc(v) { return (v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
</script>
</body>
</html>`;
}
