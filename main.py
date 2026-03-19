import os
import json
import shutil
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from automation import executar_automacao

app = FastAPI(title="Bernoulli Automação")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# Rota raiz — serve o index.html diretamente
@app.get("/")
def index():
    return FileResponse("frontend/index.html")


# Execução da automação via SSE
@app.post("/executar")
async def executar(
    login: str = Form(...),
    senha: str = Form(...),
    colecao: str = Form(...),
    volume: str = Form(...),
    segmento: str = Form(...),
    serie: str = Form(...),
    ano_letivo: str = Form(...),
    csv_file: UploadFile = File(...),
):
    # Valida extensão do arquivo
    ext = os.path.splitext(csv_file.filename)[1].lower()
    if ext not in (".csv", ".xlsx"):
        return JSONResponse(status_code=400, content={"erro": "Formato inválido. Use .csv ou .xlsx"})

    caminho_csv = os.path.join(UPLOAD_DIR, csv_file.filename)
    with open(caminho_csv, "wb") as f:
        shutil.copyfileobj(csv_file.file, f)

    def gerador_sse():
        for mensagem in executar_automacao(
            login=login,
            senha=senha,
            colecao=colecao,
            volume=volume,
            segmento=segmento,
            serie=serie,
            ano_letivo=ano_letivo,
            caminho_csv=caminho_csv,
        ):
            yield f"data: {mensagem}\n\n"
        yield "data: [FIM]\n\n"

    return StreamingResponse(
        gerador_sse(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Buscar histórico
@app.get("/historico")
def get_historico():
    arquivo = "historico.json"
    if not os.path.exists(arquivo):
        return JSONResponse(content=[])
    with open(arquivo, "r", encoding="utf-8") as f:
        try:
            dados = json.load(f)
        except json.JSONDecodeError:
            dados = []
    return JSONResponse(content=dados)


# Apagar TODO o histórico
@app.delete("/historico")
def deletar_historico():
    arquivo = "historico.json"
    if os.path.exists(arquivo):
        os.remove(arquivo)
    return JSONResponse(content={"ok": True})


# Apagar UM item do histórico pelo índice
@app.delete("/historico/{indice}")
def deletar_item_historico(indice: int):
    arquivo = "historico.json"
    if not os.path.exists(arquivo):
        return JSONResponse(content={"ok": False, "erro": "Histórico não encontrado"})
    with open(arquivo, "r", encoding="utf-8") as f:
        try:
            dados = json.load(f)
        except json.JSONDecodeError:
            dados = []
    if indice < 0 or indice >= len(dados):
        return JSONResponse(content={"ok": False, "erro": "Índice inválido"})
    dados.pop(indice)
    with open(arquivo, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    return JSONResponse(content={"ok": True})


# Health check
@app.get("/status")
def status():
    return {"status": "online"}


# Arquivos estáticos (CSS, JS) — deve ficar APÓS as rotas
app.mount("/", StaticFiles(directory="frontend"), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)