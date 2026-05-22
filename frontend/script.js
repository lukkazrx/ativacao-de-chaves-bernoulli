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
const btnLimparLog       = document.getElementById("btnLimparLog");
const btnSalvarCred      = document.getElementById("btnSalvarCred");
const btnExportarPDF     = document.getElementById("btnExportarPDF");
const btnPararAutomacao  = document.getElementById("btnPararAutomacao");
const btnExportarExcel   = document.getElementById("btnExportarExcel");
const btnApagarCred      = document.getElementById("btnApagarCred");

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
let dashData = [];

function popularSelectDash(data) {
  const select = document.getElementById("dashSelect");
  // Mantém apenas a opção geral
  select.innerHTML = '<option value="geral">Visão Geral</option>';
  data.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${item.colecao} — ${item.volume} — ${item.data}`;
    select.appendChild(opt);
  });
}

document.getElementById("dashSelect").addEventListener("change", (e) => {
  if (e.target.value === "geral") {
    atualizarDashboard(dashData);
  } else {
    atualizarDashboard([dashData[parseInt(e.target.value)]]);
  }
});

function atualizarDashboard(data) {
  if (!data.length) return;

  const totalChaves = data.reduce((s, i) => s + (i.encontrados || 0), 0);
  const totalAlunos = data.reduce((s, i) => s + (i.total_alunos || 0), 0);
  const totalNaoEnc = data.reduce((s, i) => s + (i.nao_encontrados?.length || 0), 0);
  const taxaSucesso = totalAlunos > 0 ? ((totalChaves / totalAlunos) * 100).toFixed(1) : 0;

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

// ── Toggle hist item ───────────────────────────────────────────
function toggleHistItem(card) {
  const lista  = card.querySelector('.nao-encontrados-lista');
  const seta   = card.querySelector('.seta');
  if (!lista) return;
  const aberto = lista.style.display === 'block';
  lista.style.display = aberto ? 'none' : 'block';
  if (seta) seta.textContent = aberto ? '▾' : '▴';
}

// ── Toggle não encontrados ─────────────────────────────────────
function toggleNaoEncontrados(btn) {
  const lista  = btn.nextElementSibling;
  const seta   = btn.querySelector('.seta');
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

    dashData = data;
    popularSelectDash(data);
    atualizarDashboard(data);

    historicoBox.innerHTML = data.map((item, idx) => `
      <div class="hist-item" data-idx="${idx}" onclick="toggleHistItem(this)" style="cursor:pointer">
        <div class="hist-info">
          <strong>${item.colecao} — ${item.volume} — ${item.serie}</strong>
          <div class="hist-meta">
            📅 ${item.data} &nbsp;|&nbsp;
            👥 ${item.total_alunos} alunos &nbsp;|&nbsp;
            ⏱ ${item.duracao_segundos}s
          </div>
          ${item.nao_encontrados?.length
            ? `<div class="hist-meta nao-encontrados-resumo" style="margin-top:6px">
                <div class="btn-expandir">
                  ❌ ${item.nao_encontrados.length} não encontrados <span class="seta">▾</span>
                </div>
                <div class="nao-encontrados-lista" style="display:none">
                  ${item.nao_encontrados.map(n => `<span class="nao-encontrado-item">${n}</span>`).join('<br>')}
                </div>
              </div>`
            : ""}
        </div>
        <div style="display:flex;align-items:center;gap:10px;" onclick="event.stopPropagation()">
          <div class="hist-badge">✅ ${item.encontrados}</div>
          <button class="btn-pdf-item" title="Exportar PDF desta execução" data-idx="${idx}">📄</button>
          <button class="btn-excel-item" title="Exportar Excel desta execução" data-idx="${idx}">📊</button>
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

    document.querySelectorAll(".btn-pdf-item").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        exportarPDFIndividual(data[idx]);
      });
    });

    document.querySelectorAll(".btn-excel-item").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        exportarExcelIndividual(data[idx]);
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
    const res  = await fetch(`${API}/historico/${indice}`, { method: "DELETE" });
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
    const res  = await fetch(`${API}/historico`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) carregarHistorico();
  } catch {
    alert("Erro de conexão ao limpar histórico.");
  }
});

// ── Limpar log ─────────────────────────────────────────────────
btnLimparLog.addEventListener("click", () => {
  logBox.innerHTML = '<span class="log-placeholder">O log aparecerá aqui durante a execução...</span>';
});

// ── Parar automação ────────────────────────────────────────────
btnPararAutomacao.addEventListener("click", async () => {
  if (!confirm("Deseja parar a automação? O progresso até agora será salvo.")) return;
  try {
    await fetch(`${API}/cancelar`, { method: "POST" });
    adicionarLog("⚠️ Sinal de parada enviado...", "sep");
  } catch {
    adicionarLog("❌ Erro ao enviar sinal de parada.", "err");
  }
});

// ── Credenciais (localStorage) ─────────────────────────────────
function carregarCredenciais() {
  const login = localStorage.getItem("bernoulli_login");
  const senha = localStorage.getItem("bernoulli_senha");
  if (login) document.getElementById("login").value = login;
  if (senha) document.getElementById("senha").value = senha;
}

btnSalvarCred.addEventListener("click", () => {
  const login = document.getElementById("login").value.trim();
  const senha = document.getElementById("senha").value.trim();
  if (!login || !senha) {
    alert("Preencha o login e a senha antes de salvar.");
    return;
  }
  localStorage.setItem("bernoulli_login", login);
  localStorage.setItem("bernoulli_senha", senha);
  alert("✅ Credenciais salvas!");
});

btnApagarCred.addEventListener("click", () => {
  if (!confirm("Apagar as credenciais salvas?")) return;
  localStorage.removeItem("bernoulli_login");
  localStorage.removeItem("bernoulli_senha");
  document.getElementById("login").value = "";
  document.getElementById("senha").value = "";
  alert("✅ Credenciais apagadas.");
});

carregarCredenciais();

// ── Exportar PDF individual ────────────────────────────────────
function exportarPDFIndividual(item) {
  try {
    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const agora = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
    const taxa  = item.total_alunos > 0 ? ((item.encontrados / item.total_alunos) * 100).toFixed(1) : 0;

    doc.setFillColor(0, 113, 227);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bernoulli Auto", 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${item.colecao} — ${item.volume} — ${item.serie || ""}`, 14, 19);
    doc.text(`Gerado em: ${agora}`, pageW - 14, 19, { align: "right" });

    const metricas = [
      { label: "Data",             valor: item.data },
      { label: "Total de alunos",  valor: item.total_alunos },
      { label: "Encontrados",      valor: item.encontrados },
      { label: "Não encontrados",  valor: item.nao_encontrados?.length || 0 },
      { label: "Taxa de sucesso",  valor: taxa + "%" },
      { label: "Duração",          valor: item.duracao_segundos + "s" },
    ];

    const boxW = (pageW - 28) / 3;
    metricas.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x   = 14 + col * (boxW + 2);
      const y   = 33 + row * 22;
      doc.setFillColor(245, 245, 247);
      doc.roundedRect(x, y, boxW, 18, 2, 2, "F");
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 113, 227);
      doc.text(String(m.valor), x + boxW / 2, y + 9, { align: "center" });
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 110);
      doc.text(m.label, x + boxW / 2, y + 15, { align: "center" });
    });

    let startY = 82;

    if (item.nao_encontrados?.length) {
      if (startY > 220) { doc.addPage(); startY = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 59, 48);
      doc.text(`❌ Não encontrados (${item.nao_encontrados.length})`, 14, startY);
      doc.autoTable({
        startY: startY + 4,
        head: [["#", "Nome do Aluno"]],
        body: item.nao_encontrados.map((nome, i) => [i + 1, nome]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [255, 59, 48], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: { 0: { cellWidth: 12, halign: "center" } },
        margin: { left: 14, right: 14 },
      });
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setTextColor(180, 180, 180);
      doc.text(`Página ${p} de ${totalPages}`, pageW / 2, 290, { align: "center" });
      doc.text("Bernoulli Auto — Relatório gerado automaticamente", 14, 290);
    }

    const col = item.colecao;
    const vol = item.volume.replace(" ", "-");
    const dat = item.data.replace(/[\/: ]/g, "-");
    doc.save("bernoulli-" + col + "-" + vol + "-" + dat + ".pdf");

  } catch (err) {
    alert("Erro ao gerar PDF: " + err.message);
  }
}

// ── Exportar Excel individual ──────────────────────────────────
function exportarExcelIndividual(item) {
  try {
    const wb = XLSX.utils.book_new();

    const resumo = [{
      "Data":            item.data,
      "Coleção":         item.colecao,
      "Volume":          item.volume,
      "Série":           item.serie || "—",
      "Ano Letivo":      item.ano_letivo,
      "Total Alunos":    item.total_alunos,
      "Encontrados":     item.encontrados,
      "Não Encontrados": item.nao_encontrados?.length || 0,
      "Taxa de Sucesso": item.total_alunos > 0
        ? ((item.encontrados / item.total_alunos) * 100).toFixed(1) + "%"
        : "0%",
      "Duração (s)": item.duracao_segundos,
    }];
    const wsResumo = XLSX.utils.json_to_sheet(resumo);
    wsResumo["!cols"] = [
      {wch:16},{wch:8},{wch:12},{wch:10},
      {wch:10},{wch:12},{wch:12},{wch:16},{wch:14},{wch:12}
    ];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    if (item.nao_encontrados?.length) {
      const rows = item.nao_encontrados.map((nome, i) => ({
        "#": i + 1,
        "Nome do Aluno": nome,
      }));
      const wsNaoEnc = XLSX.utils.json_to_sheet(rows);
      wsNaoEnc["!cols"] = [{wch:4},{wch:40}];
      XLSX.utils.book_append_sheet(wb, wsNaoEnc, "Não Encontrados");
    }

    const col = item.colecao;
    const vol = item.volume.replace(" ", "-");
    const dat = item.data.replace(/[\/: ]/g, "-");
    XLSX.writeFile(wb, "bernoulli-" + col + "-" + vol + "-" + dat + ".xlsx");

  } catch (err) {
    alert("Erro ao gerar Excel: " + err.message);
  }
}

// ── Exportar PDF completo ──────────────────────────────────────
btnExportarPDF.addEventListener("click", async () => {
  try {
    const res  = await fetch(`${API}/historico`);
    const data = await res.json();

    if (!data.length) {
      alert("Nenhuma execução no histórico para exportar.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const agora = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });

    doc.setFillColor(0, 113, 227);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bernoulli Auto", 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Relatório de Ativação de Chaves", 14, 19);
    doc.text(`Gerado em: ${agora}`, pageW - 14, 19, { align: "right" });

    const totalChaves = data.reduce((s, i) => s + (i.encontrados || 0), 0);
    const totalAlunos = data.reduce((s, i) => s + (i.total_alunos || 0), 0);
    const totalNaoEnc = data.reduce((s, i) => s + (i.nao_encontrados?.length || 0), 0);
    const taxa        = totalAlunos > 0 ? ((totalChaves / totalAlunos) * 100).toFixed(1) : 0;

    const metricas = [
      { label: "Execuções",       valor: data.length },
      { label: "Chaves ativadas", valor: totalChaves },
      { label: "Não encontrados", valor: totalNaoEnc },
      { label: "Taxa de sucesso", valor: taxa + "%" },
    ];

    const boxW = (pageW - 28) / metricas.length;
    metricas.forEach((m, i) => {
      const x = 14 + i * (boxW + 2);
      doc.setFillColor(245, 245, 247);
      doc.roundedRect(x, 33, boxW, 18, 2, 2, "F");
      doc.setFontSize(13);
      doc.setTextColor(0, 113, 227);
      doc.text(String(m.valor), x + boxW / 2, 42, { align: "center" });
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 110);
      doc.setFont("helvetica", "normal");
      doc.text(m.label, x + boxW / 2, 48, { align: "center" });
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Detalhamento das Execuções", 14, 61);

    doc.autoTable({
      startY: 64,
      head: [["#", "Data", "Coleção / Volume", "Série", "Ano", "Total", "✅", "❌", "Tempo"]],
      body: data.map((item, idx) => [
        idx + 1, item.data,
        `${item.colecao} — ${item.volume}`,
        item.serie || "—", item.ano_letivo,
        item.total_alunos, item.encontrados,
        item.nao_encontrados?.length || 0,
        item.duracao_segundos + "s",
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0, 113, 227], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 247] },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        5: { halign: "center" },
        6: { halign: "center", textColor: [36, 138, 61] },
        7: { halign: "center", textColor: [255, 59, 48] },
        8: { halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });

    data.forEach((item) => {
      if (!item.nao_encontrados?.length) return;
      doc.addPage();
      doc.setFillColor(0, 113, 227);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`Não encontrados — ${item.colecao} ${item.volume} (${item.data})`, 14, 12);
      doc.setTextColor(30, 30, 30);
      doc.autoTable({
        startY: 24,
        head: [["#", "Nome do Aluno"]],
        body: item.nao_encontrados.map((nome, i) => [i + 1, nome]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [255, 59, 48], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [255, 245, 245] },
        columnStyles: { 0: { cellWidth: 12, halign: "center" } },
        margin: { left: 14, right: 14 },
      });
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7.5);
      doc.setTextColor(180, 180, 180);
      doc.text(`Página ${p} de ${totalPages}`, pageW / 2, 290, { align: "center" });
      doc.text("Bernoulli Auto — Relatório gerado automaticamente", 14, 290);
    }

    doc.save(`bernoulli-relatorio-${new Date().toISOString().slice(0,10)}.pdf`);

  } catch (err) {
    alert("Erro ao gerar PDF: " + err.message);
  }
});

// ── Exportar Excel completo ────────────────────────────────────
btnExportarExcel.addEventListener("click", async () => {
  try {
    const res  = await fetch(`${API}/historico`);
    const data = await res.json();

    if (!data.length) {
      alert("Nenhuma execução no histórico para exportar.");
      return;
    }

    const wb = XLSX.utils.book_new();

    const resumo = data.map((item, idx) => ({
      "#":               idx + 1,
      "Data":            item.data,
      "Coleção":         item.colecao,
      "Volume":          item.volume,
      "Série":           item.serie || "—",
      "Ano Letivo":      item.ano_letivo,
      "Total Alunos":    item.total_alunos,
      "Encontrados":     item.encontrados,
      "Não Encontrados": item.nao_encontrados?.length || 0,
      "Taxa de Sucesso": item.total_alunos > 0
        ? ((item.encontrados / item.total_alunos) * 100).toFixed(1) + "%"
        : "0%",
      "Duração (s)": item.duracao_segundos,
    }));

    const wsResumo = XLSX.utils.json_to_sheet(resumo);
    wsResumo["!cols"] = [
      {wch:4},{wch:16},{wch:8},{wch:12},{wch:10},
      {wch:10},{wch:12},{wch:12},{wch:16},{wch:14},{wch:12}
    ];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    data.forEach((item) => {
      if (!item.nao_encontrados?.length) return;
      const rows = item.nao_encontrados.map((nome, i) => ({
        "#": i + 1,
        "Nome do Aluno": nome,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{wch:4},{wch:40}];
      const nomeAba = (item.colecao + " " + item.volume).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    });

    XLSX.writeFile(wb, `bernoulli-historico-${new Date().toISOString().slice(0,10)}.xlsx`);

  } catch (err) {
    alert("Erro ao gerar Excel: " + err.message);
  }
});

btnHistorico.addEventListener("click", carregarHistorico);
carregarHistorico();