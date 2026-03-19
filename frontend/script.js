const API = "http://127.0.0.1:8000";

// ── Elementos ──────────────────────────────────────────────────
const btnExecutar       = document.getElementById("btnExecutar");
const btnHistorico      = document.getElementById("btnHistorico");
const btnLimparHistorico = document.getElementById("btnLimparHistorico");
const logBox            = document.getElementById("logBox");
const statusPill        = document.getElementById("statusPill");
const fileDrop          = document.getElementById("fileDrop");
const csvFile           = document.getElementById("csvFile");
const fileLabel         = document.getElementById("fileLabel");
const historicoBox      = document.getElementById("historicoBox");

// ── Verifica status da API ─────────────────────────────────────
async function verificarStatus() {
  try {
    const res = await fetch(`${API}/status`);
    if (res.ok) {
      statusPill.textContent = "";
      const dot = document.createElement("span");
      dot.className = "dot";
      statusPill.appendChild(dot);
      statusPill.appendChild(document.createTextNode(" API online"));
      statusPill.classList.add("online");
    }
  } catch {
    statusPill.className = "status-pill";
    statusPill.innerHTML = `<span class="dot"></span> API offline`;
  }
}

verificarStatus();
setInterval(verificarStatus, 10000);

// ── Upload de arquivo ──────────────────────────────────────────
fileDrop.addEventListener("click", () => csvFile.click());

csvFile.addEventListener("change", () => {
  if (csvFile.files[0]) {
    fileLabel.textContent = csvFile.files[0].name;
    fileLabel.classList.add("selected");
  }
});

fileDrop.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDrop.classList.add("over");
});

fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("over"));

fileDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDrop.classList.remove("over");
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".csv")) {
    const dt = new DataTransfer();
    dt.items.add(file);
    csvFile.files = dt.files;
    fileLabel.textContent = file.name;
    fileLabel.classList.add("selected");
  } else {
    adicionarLog("❌ Arquivo inválido. Envie um .csv", "err");
  }
});

// ── Log helpers ────────────────────────────────────────────────
function limparLog() {
  logBox.innerHTML = "";
}

function adicionarLog(mensagem, tipo = "") {
  const linha = document.createElement("span");
  linha.className = `log-line ${tipo}`;
  linha.textContent = mensagem;
  logBox.appendChild(linha);
  logBox.scrollTop = logBox.scrollHeight;
}

function classificarLinha(msg) {
  if (msg.startsWith("✅")) return "ok";
  if (msg.startsWith("❌")) return "err";
  if (msg.startsWith("─")) return "sep";
  return "";
}

// ── Execução principal ─────────────────────────────────────────
btnExecutar.addEventListener("click", async () => {
  const login     = document.getElementById("login").value.trim();
  const senha     = document.getElementById("senha").value.trim();
  const colecao   = document.getElementById("colecao").value.trim();
  const volume    = document.getElementById("volume").value.trim();
  const segmento  = document.getElementById("segmento").value.trim();
  const serie     = document.getElementById("serie").value.trim();
  const anoLetivo = document.getElementById("anoLetivo").value.trim();
  const arquivo   = csvFile.files[0];

  if (!login || !senha) {
    adicionarLog("❌ Preencha o login e a senha.", "err");
    return;
  }
  if (!arquivo) {
    adicionarLog("❌ Selecione o arquivo CSV de alunos.", "err");
    return;
  }

  const form = new FormData();
  form.append("login", login);
  form.append("senha", senha);
  form.append("colecao", colecao);
  form.append("volume", volume);
  form.append("segmento", segmento);
  form.append("serie", serie);
  form.append("ano_letivo", anoLetivo);
  form.append("csv_file", arquivo);

  limparLog();
  btnExecutar.disabled = true;
  btnExecutar.querySelector("span").textContent = "Executando...";

  try {
    const res = await fetch(`${API}/executar`, { method: "POST", body: form });

    if (!res.ok) {
      adicionarLog(`❌ Erro HTTP ${res.status}`, "err");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split("\n");
      buffer = linhas.pop();

      for (const linha of linhas) {
        if (linha.startsWith("data: ")) {
          const msg = linha.replace("data: ", "").trim();
          if (msg === "[FIM]") {
            adicionarLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "sep");
            adicionarLog("Execução finalizada.", "ok");
            carregarHistorico();
            break;
          }
          adicionarLog(msg, classificarLinha(msg));
        }
      }
    }

  } catch (err) {
    adicionarLog(`❌ Erro de conexão: ${err.message}`, "err");
    adicionarLog("Verifique se a API está rodando (python main.py)", "sep");
  } finally {
    btnExecutar.disabled = false;
    btnExecutar.querySelector("span").textContent = "Executar Automação";
  }
});

// ── Histórico — carregar ───────────────────────────────────────
async function carregarHistorico() {
  try {
    const res  = await fetch(`${API}/historico`);
    const data = await res.json();

    if (!data.length) {
      historicoBox.innerHTML = `<span class="log-placeholder">Nenhuma execução registrada ainda.</span>`;
      return;
    }

    historicoBox.innerHTML = data.map((item, idx) => `
      <div class="hist-item" data-idx="${idx}">
        <div class="hist-info">
          <strong>${item.colecao} — ${item.volume} — ${item.serie}</strong>
          <div class="hist-meta">
            📅 ${item.data} &nbsp;|&nbsp;
            👥 ${item.total_alunos} alunos &nbsp;|&nbsp;
            ⏱ ${item.duracao_segundos}s
          </div>
          ${item.nao_encontrados?.length
            ? `<div class="hist-meta" style="color:#f87171">❌ Não encontrados: ${item.nao_encontrados.join(", ")}</div>`
            : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="hist-badge">✅ ${item.encontrados}</div>
          <button class="btn-excluir-item" title="Excluir este registro" data-idx="${idx}">🗑</button>
        </div>
      </div>
    `).join("");

    // Eventos nos botões de excluir item
    document.querySelectorAll(".btn-excluir-item").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const idx = e.currentTarget.dataset.idx;
        await excluirItem(idx);
      });
    });

  } catch {
    historicoBox.innerHTML = `<span class="log-placeholder">Erro ao carregar histórico. A API está online?</span>`;
  }
}

// ── Histórico — excluir item ───────────────────────────────────
async function excluirItem(indice) {
  if (!confirm("Excluir este registro do histórico?")) return;
  try {
    const res = await fetch(`${API}/historico/${indice}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) carregarHistorico();
    else alert("Erro ao excluir: " + data.erro);
  } catch {
    alert("Erro de conexão ao excluir item.");
  }
}

// ── Histórico — limpar tudo ────────────────────────────────────
btnLimparHistorico.addEventListener("click", async () => {
  if (!confirm("Tem certeza que deseja apagar TODO o histórico? Esta ação não pode ser desfeita.")) return;
  try {
    const res = await fetch(`${API}/historico`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) carregarHistorico();
  } catch {
    alert("Erro de conexão ao limpar histórico.");
  }
});

btnHistorico.addEventListener("click", carregarHistorico);
carregarHistorico();