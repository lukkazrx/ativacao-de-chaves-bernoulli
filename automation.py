from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from time import sleep
import pandas as pd
import unicodedata
import re
import json
import os
from datetime import datetime


def normalizar(texto):
    texto = texto.strip().lower()
    texto = unicodedata.normalize('NFKD', texto)
    texto = ''.join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r'[^a-z0-9\s]', '', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto


def salvar_historico(dados: dict):
    """Salva o resultado da execução no arquivo historico.json."""
    arquivo = "historico.json"
    historico = []

    if os.path.exists(arquivo):
        with open(arquivo, "r", encoding="utf-8") as f:
            try:
                historico = json.load(f)
            except json.JSONDecodeError:
                historico = []

    historico.insert(0, dados)  # mais recente primeiro

    with open(arquivo, "w", encoding="utf-8") as f:
        json.dump(historico, f, ensure_ascii=False, indent=2)


def executar_automacao(
    login: str,
    senha: str,
    colecao: str,
    volume: str,
    segmento: str,
    serie: str,
    ano_letivo: str,
    caminho_csv: str,
):
    """
    Função geradora que executa a automação e yields mensagens de log.
    Uso: for msg in executar_automacao(...): print(msg)
    """

    inicio = datetime.now()
    encontrados = []
    nao_encontrados = []

    yield "🚀 Iniciando automação..."

    # --- Configuração do navegador ---
    try:
        options = Options()
        options.add_argument("--start-maximized")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.maximize_window()
        wait = WebDriverWait(driver, 10)
        yield "✅ Navegador iniciado com sucesso."
    except Exception as e:
        yield f"❌ Erro ao iniciar o navegador: {e}"
        return

    def encontrar_e_clicar(by, selector, cliques=1, intervalo=1):
        elemento = wait.until(EC.element_to_be_clickable((by, selector)))
        for _ in range(cliques):
            elemento.click()
            if cliques > 1:
                sleep(intervalo)
        return elemento

    try:
        # --- Login ---
        yield "🔐 Acessando página de login..."
        driver.get("https://mb4.bernoulli.com.br/login")

        wait.until(EC.presence_of_element_located((By.ID, "re-login"))).send_keys(login)
        wait.until(EC.presence_of_element_located((By.ID, "input-pass"))).send_keys(senha)
        encontrar_e_clicar(By.CLASS_NAME, "fill--bernoulli")
        yield "🔐 Login enviado, aguardando autenticação..."

        # --- Seleção de unidade ---
        encontrar_e_clicar(By.CLASS_NAME, "select--head")
        encontrar_e_clicar(By.XPATH, "//li[text()='Direção - Colégio La Salle Canoas']")
        encontrar_e_clicar(By.CLASS_NAME, "fill--bernoulli")
        yield "🏫 Unidade selecionada."

        # --- Navegação até Chaves ---
        yield "🔑 Navegando até Configurações > Chaves..."
        encontrar_e_clicar(By.XPATH, "//button[contains(@class, 'IButton') and contains(@class, 'action')]")
        encontrar_e_clicar(By.XPATH, "//div[text()='Configurações']")
        encontrar_e_clicar(By.XPATH, "//button[.//div[text()='Chaves']]")
        sleep(1)

        # --- Ordenar por ano letivo ---
        encontrar_e_clicar(By.XPATH, "//th[.//span[text()='Ano letivo']]//button", cliques=2, intervalo=2)
        sleep(1)
        yield "📋 Tabela ordenada por ano letivo."

        # --- Mostrar 50 por página ---
        driver.execute_script("window.scrollBy(0, 1000);")
        elemento = wait.until(EC.element_to_be_clickable((
            By.XPATH, "//div[contains(@class, 'select--head')][.//span[contains(text(), '10 por página')]]"
        )))
        driver.execute_script("arguments[0].click();", elemento)
        elemento = wait.until(EC.element_to_be_clickable((By.XPATH, "//li[text()='50 por página']")))
        driver.execute_script("arguments[0].click();", elemento)
        yield "📄 Exibindo 50 registros por página."

        # --- Localizar linha da coleção ---
        yield f"🔍 Procurando: {colecao} | {volume} | {serie} | {ano_letivo}..."
        xpath_linha = (
            f"//tbody/tr["
            f".//td[1]//span[text()='{colecao}'] and "
            f".//td[2]//span[text()='{volume}'] and "
            f".//td[3][text()='{segmento}'] and "
            f".//td[4][text()='{serie}'] and "
            f".//td[7][text()='{ano_letivo}']"
            f"]"
        )
        linha = wait.until(EC.presence_of_element_located((By.XPATH, xpath_linha)))
        botao = linha.find_element(By.XPATH, ".//button[.//i[contains(@class, 'ph-key')]]")
        driver.execute_script("arguments[0].click();", botao)
        sleep(2)
        yield "✅ Linha encontrada. Modal de ativação em massa aberto."

        # --- Ler arquivo de alunos (CSV ou Excel) ---
        ext = os.path.splitext(caminho_csv)[1].lower()
        yield f"📂 Lendo arquivo: {caminho_csv}"
        if ext in ('.xlsx', '.xls'):
            df = pd.read_excel(caminho_csv, header=None, skiprows=1)
        elif ext == '.csv':
            df = pd.read_csv(caminho_csv, header=None, skiprows=1)
        else:
            yield f"❌ Formato não suportado: {ext}. Use .csv ou .xlsx"
            return
        nomes = df.iloc[:, 0].tolist()
        yield f"👥 {len(nomes)} aluno(s) encontrado(s) no arquivo."

        # --- Mapear nomes na página ---
        spans = driver.find_elements(By.XPATH, "//span[contains(@class, 'body-16-400')]")
        nomes_pagina = {normalizar(s.text): s for s in spans}

        # --- Selecionar alunos ---
        yield "🖱️ Iniciando seleção dos alunos..."
        for nome in nomes:
            nome_normalizado = normalizar(nome)
            if nome_normalizado in nomes_pagina:
                span = nomes_pagina[nome_normalizado]
                label = span.find_element(By.XPATH, "./ancestor::label")
                driver.execute_script("arguments[0].click();", label)
                encontrados.append(nome)
                yield f"✅ {nome}"
            else:
                nao_encontrados.append(nome)
                yield f"❌ {nome} — não encontrado"

        yield "─" * 40
        yield f"✅ Encontrados: {len(encontrados)} | ❌ Não encontrados: {len(nao_encontrados)}"
        yield "🏁 Automação concluída! Verifique o navegador para confirmar antes de salvar."

    except Exception as e:
        yield f"❌ Erro durante a execução: {e}"

    finally:
        # --- Salvar histórico ---
        fim = datetime.now()
        salvar_historico({
            "data": inicio.strftime("%d/%m/%Y %H:%M"),
            "colecao": colecao,
            "volume": volume,
            "serie": serie,
            "ano_letivo": ano_letivo,
            "total_alunos": len(nomes) if 'nomes' in locals() else 0,
            "encontrados": len(encontrados),
            "nao_encontrados": nao_encontrados,
            "duracao_segundos": round((fim - inicio).total_seconds(), 1),
        })
        yield "💾 Histórico salvo."