import os, ast, re, time, traceback, collections, datetime, requests, json
from typing import List, Tuple
import numpy as np

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

# 1. ENVIRONMENT VARIABLES ────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL   = os.getenv("SUPABASE_URL")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME_KB  = os.getenv("SUPABASE_TABLE_NAME_KB") or "client_knowledge_base"
TABLE_NAME_LOG = os.getenv("SUPABASE_TABLE_NAME_LOG") or "client_conversations"
CONFIG_URL_BASE= os.getenv("CONFIG_URL_BASE") or "https://two47convo.onrender.com/configs"
API_TOKEN      = os.getenv("API_TOKEN")

def _mask(s): return f"{s[:4]}…{s[-4:]}" if s else "❌ NONE"
print("🔧 ENV →", 
      "| SUPABASE_URL", SUPABASE_URL or "❌",
      "| KB TABLE", TABLE_NAME_KB,
      "| LOG TABLE", TABLE_NAME_LOG,
      "| TOKEN", _mask(API_TOKEN))

if not (SUPABASE_URL and SUPABASE_KEY):
    raise RuntimeError("❌ Critical env-vars missing – aborting boot!")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. CONFIG + OPENAI LOADING ──────────────────────────────────────────────────
def fetch_config(client_id: str) -> dict:
    try:
        url = f"{CONFIG_URL_BASE}/{client_id}.json"
        cfg = requests.get(url).json()
        print(f"✅ Loaded config for {client_id}:", cfg.get("chatbotName"))
        return cfg
    except Exception:
        print(f"❌ Failed to load config for {client_id} – using fallback")
        return {
            "chatbotName": "Chatbot",
            "brandName": "Your Brand",
            "supportUrl": "#"
        }

def get_openai_client(client_id: str) -> OpenAI:
    safe_id = client_id.replace("-", "_").upper()
    key = os.getenv(f"OPENAI_API_KEY_{safe_id}", os.getenv("OPENAI_API_KEY"))
    if not key:
        raise RuntimeError("❌ No OpenAI key found for client")
    return OpenAI(api_key=key)

# 3. EMBEDDINGS ───────────────────────────────────────────────────────────────
def get_embedding(text: str, client: OpenAI) -> List[float]:
    emb = client.embeddings.create(
        model="text-embedding-ada-002",
        input=[text]
    )
    return emb.data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q: str, client_id: str, openai_client: OpenAI) -> Tuple[str, float]:
    q_emb = get_embedding(q, openai_client)
    rows = supabase.table(TABLE_NAME_KB).select("*").eq("client_id", client_id).execute().data or []

    best, best_score = "", -1.0
    for r in rows:
        try:
            emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
            score = cosine(q_emb, emb)
            if score > best_score:
                best, best_score = r["content"], score
        except Exception:
            continue
    return best, best_score

# 4. GREETING DETECTOR ────────────────────────────────────────────────────────
GREETING_RE = re.compile(r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening)|what'?s up)\b", re.I)
def is_greeting(t: str) -> bool: return bool(GREETING_RE.search(t.strip()))

# 5. RATE LIMIT ───────────────────────────────────────────────────────────────
RATE_LIMIT, RATE_PERIOD = 30, 60
_ip_hits: dict[str, collections.deque] = {}

def rate_limited(ip: str) -> bool:
    now, bucket = time.time(), _ip_hits.setdefault(ip, collections.deque())
    while bucket and now - bucket[0] > RATE_PERIOD: bucket.popleft()
    if len(bucket) >= RATE_LIMIT: return True
    bucket.append(now); return False

# 6. MAIN ANSWER FUNCTION ─────────────────────────────────────────────────────
def answer(user_q: str, client_id: str, config: dict, openai_client: OpenAI) -> str:
    ctx, score = fetch_best_match(user_q, client_id, openai_client)

    if score >= SIM_THRESHOLD:
        prompt = (
            f"You are {config['chatbotName']}, the helpful AI assistant for {config['brandName']}.\n"
            "Answer ONLY using the knowledge below:\n\n"
            f"Knowledge:\n{ctx}\n\nUser Question: {user_q}\nAnswer:"
        )
        chat = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return chat.choices[0].message.content.strip()

    if is_greeting(user_q):
        chat = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": f"You are {config['chatbotName']}, a warm, concise chatbot."},
                {"role": "user", "content": user_q}
            ]
        )
        return chat.choices[0].message.content.strip()

    return f"I couldn’t find that in my knowledge base. Please visit our support page: {config.get('supportUrl', '#')}"

# 7. FASTAPI SETUP ────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root(): return {"status": "247Chatbot backend running"}

@app.options("/chat")
async def options_chat(): return JSONResponse(content={}, status_code=204)

@app.post("/chat")
async def chat(req: Request):
    payload = await req.json()

    token = payload.get("token", "")
    if token != API_TOKEN:
        raise HTTPException(401, "Unauthorized – bad token")

    client_id = payload.get("client_id", "").strip()
    if not client_id:
        raise HTTPException(400, "Missing client_id")

    client_ip = req.client.host or "unknown"
    if rate_limited(client_ip):
        raise HTTPException(429, "Too many requests – slow down.")

    user_q = str(payload.get("question", "")).strip()
    if not user_q:
        return {"answer": "Please type a question 🙂"}

    try:
        config = fetch_config(client_id)
        openai_client = get_openai_client(client_id)
        bot_answer = answer(user_q, client_id, config, openai_client)
        return {"answer": bot_answer}
    except Exception:
        print("❌ CRASH in /chat")
        traceback.print_exc()
        return {"answer": "Sorry, something went wrong. Please try again later."}

# 8. CHAT SUMMARY LOGGER ──────────────────────────────────────────────────────
@app.post("/summary")
async def save_chat_summary(req: Request):
    try:
        payload = await req.json()
        if payload.get("token") != API_TOKEN:
            raise HTTPException(401, "Unauthorized – bad token")

        name      = payload.get("name", "").strip()
        email     = payload.get("email", "").strip()
        chat_log  = payload.get("chat_log", [])
        client_id = payload.get("client_id", "").strip()
        timestamp = datetime.datetime.utcnow().isoformat()

        if not name or not email or not chat_log or not client_id:
            raise HTTPException(400, "Missing required fields.")

        supabase.table(TABLE_NAME_LOG).insert({
            "name"      : name,
            "email"     : email,
            "chat_log"  : chat_log,
            "client_id" : client_id,
            "timestamp" : timestamp
        }).execute()

        return {"status": "Chat summary saved."}

    except Exception:
        print("❌ CRASH in /summary")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Internal error"})

# 9. SERVE CONFIG JSON WITH CORS HEADERS ──────────────────────────────────────
@app.get("/configs/{client_id}.json")
async def get_config_file(client_id: str):
    filepath = f"configs/{client_id}.json"
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Config file for {client_id} not found")
    return FileResponse(
        filepath,
        media_type="application/json",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-cache"
        }
    )

# 10. STATIC ROOT ─────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static", html=True), name="static")

# 11. EXCLUDE CONFIGS FROM STATIC SERVING ─────────────────────────────────────
# Explicitly handle /configs/ to prevent static file serving
@app.get("/configs/{path:path}")
async def block_configs_static(path: str):
    raise HTTPException(status_code=404, detail="Config files must be accessed via /configs/{client_id}.json")