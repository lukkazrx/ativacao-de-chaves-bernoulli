const API = "http://127.0.0.1:8000";

// ── Elementos ──────────────────────────────────────────────────
const btnExecutar        = document.getElementById("btnExecutar");
const btnHistorico       = document.getElementById("btnHistorico");
const btnLimparHistorico = document.getElementById("btnLimparHistorico");
const logBox             = document.getElementById("logBox");
const statusPill         = document.getElementById("statusPill");
const fileDrop           = document.getElementById("fileDrop");
const csvFile            = document.getElementById("csvFile");
const fileLabel          = document.getElementById("fileLabel");
const historicoBox       = document.getElementById("historicoBox");

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
  if (file && (file.name.endsWith(".csv") || file.name.endsWith(".xlsx"))) {
    const dt = new DataTransfer();
    dt.items.add(file);
    csvFile.files = dt.files;
    fileLabel.textContent = file.name;
    fileLabel.classList.add("selected");
  } else {
    adicionarLog("❌ Arquivo inválido. Envie um .csv ou .xlsx", "err");
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
  const anoLetivo = document.getElementById("anoLetivo").value.trim();
  const arquivo   = csvFile.files[0];

  if (!login || !senha) {
    adicionarLog("❌ Preencha o login e a senha.", "err");
    return;
  }
  if (!arquivo) {
    adicionarLog("❌ Selecione o arquivo de alunos.", "err");
    return;
  }

  const form = new FormData();
  form.append("login", login);
  form.append("senha", senha);
  form.append("colecao", colecao);
  form.append("volume", volume);
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

// ── Dashboard ──────────────────────────────────────────────────
let dashChartInstance = null;

function atualizarDashboard(data) {
  if (!data.length) return;

  const totalChaves    = data.reduce((s, i) => s + (i.encontrados || 0), 0);
  const totalAlunos    = data.reduce((s, i) => s + (i.total_alunos || 0), 0);
  const totalNaoEnc    = data.reduce((s, i) => s + (i.nao_encontrados?.length || 0), 0);
  const taxaSucesso    = totalAlunos > 0 ? ((totalChaves / totalAlunos) * 100).toFixed(1) : 0;

  document.getElementById("dashTotalChaves").textContent    = totalChaves.toLocaleString("pt-BR");
  document.getElementById("dashTaxaSucesso").textContent    = taxaSucesso + "%";
  document.getElementById("dashTotalExecucoes").textContent = data.length;

  const ctx = document.getElementById("dashChart").getContext("2d");
  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Encontrados", "Não encontrados"],
      datasets: [{
        data: [totalChaves, totalNaoEnc],
        backgroundColor: ["rgba(52,199,89,0.8)", "rgba(255,59,48,0.7)"],
        borderColor: ["#34c759", "#ff3b30"],
        borderWidth: 1.5,
      }]
    },
    options: {
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { font: { size: 12 }, padding: 16 }
        }
      }
    }
  });
}

// ── Toggle não encontrados ─────────────────────────────────────
function toggleNaoEncontrados(btn) {
  const lista = btn.nextElementSibling;
  const seta  = btn.querySelector('.seta');
  const aberto = lista.style.display === 'block';
  lista.style.display = aberto ? 'none' : 'block';
  seta.textContent = aberto ? '▾' : '▴';
}

// ── Histórico — carregar ───────────────────────────────────────
async function carregarHistorico() {
  try {
    const res  = await fetch(`${API}/historico`);
    const data = await res.json();

    if (!data.length) {
      historicoBox.innerHTML = `<span class="log-placeholder">Nenhuma execução registrada ainda.</span>`;
      return;
    }

    atualizarDashboard(data);

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
            ? `<div class="hist-meta nao-encontrados-resumo" style="margin-top:6px">
                <button class="btn-expandir" onclick="toggleNaoEncontrados(this)">
                  ❌ ${item.nao_encontrados.length} não encontrados <span class="seta">▾</span>
                </button>
                <div class="nao-encontrados-lista" style="display:none">
                  ${item.nao_encontrados.map(n => `<span class="nao-encontrado-item">${n}</span>`).join('<br>')}
                </div>
              </div>`
            : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="hist-badge">✅ ${item.encontrados}</div>
          <button class="btn-excluir-item" title="Excluir este registro" data-idx="${idx}">🗑</button>
        </div>
      </div>
    `).join("");

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

btnLimparLog.addEventListener("click", () => {
  logBox.innerHTML = '<span class="log-placeholder">O log aparecerá aqui durante a execução...</span>';
});

btnHistorico.addEventListener("click", carregarHistorico);
carregarHistorico();