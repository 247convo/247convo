# ─────────────────────────────────────────────────────────────────────────────
#  chatbot_api.py – 247Chatbot backend (config.json + Supabase logging)
# ─────────────────────────────────────────────────────────────────────────────
import os, ast, re, time, traceback, collections, datetime, requests
from typing import List, Tuple
import numpy as np

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

# 1. ENVIRONMENT VARIABLES ────────────────────────────────────────────────────
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL   = os.getenv("SUPABASE_URL")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLE_NAME     = os.getenv("SUPABASE_TABLE_NAME") or "chat_kb"
API_TOKEN      = os.getenv("API_TOKEN")
CONFIG_URL     = os.getenv("CONFIG_URL") or "https://two47convo.onrender.com/config.json"

def _mask(s): return f"{s[:4]}…{s[-4:]}" if s else "❌ NONE"
print("🔧 ENV →", "OPENAI", _mask(OPENAI_API_KEY),
      "| SUPABASE_URL", SUPABASE_URL or "❌",
      "| TABLE", TABLE_NAME,
      "| TOKEN", _mask(API_TOKEN))

if not (OPENAI_API_KEY and SUPABASE_URL and SUPABASE_KEY):
    raise RuntimeError("❌ Critical env-vars missing – aborting boot!")

openai_client = OpenAI(api_key=OPENAI_API_KEY)
supabase      = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. CONFIG.JSON LOADING ──────────────────────────────────────────────────────
try:
    CONFIG = requests.get(CONFIG_URL).json()
    print("✅ config.json loaded:", CONFIG.get("chatbotName"))
except Exception as e:
    print("❌ Failed to load config.json")
    CONFIG = {
        "chatbotName": "Chatbot",
        "brandName": "Your Brand",
        "supportUrl": "#"
    }

BOT_NAME    = CONFIG.get("chatbotName", "Chatbot")
BRAND_NAME  = CONFIG.get("brandName", "Brand")
SUPPORT_URL = CONFIG.get("supportUrl", "#")

# 3. EMBEDDINGS ───────────────────────────────────────────────────────────────
def get_embedding(text: str) -> List[float]:
    emb = openai_client.embeddings.create(
        model="text-embedding-ada-002",
        input=[text]
    )
    return emb.data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q: str) -> Tuple[str, float]:
    q_emb = get_embedding(q)
    rows  = supabase.table(TABLE_NAME).select("*").execute().data or []
    best, best_score = "", -1.0
    for r in rows:
        emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
        score = cosine(q_emb, emb)
        if score > best_score:
            best, best_score = r["content"], score
    return best, best_score

# 4. GREETING DETECTOR ────────────────────────────────────────────────────────
GREETING_RE = re.compile(
    r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening)|what'?s up)\b", re.I
)
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
def answer(user_q: str) -> str:
    ctx, score = fetch_best_match(user_q)

    if score >= SIM_THRESHOLD:
        prompt = (
            f"You are {BOT_NAME}, the helpful AI assistant for {BRAND_NAME}.\n"
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
                {"role": "system", "content": f"You are {BOT_NAME}, a warm, concise chatbot."},
                {"role": "user", "content": user_q}
            ]
        )
        return chat.choices[0].message.content.strip()

    return f"I couldn’t find that in my knowledge base. Please visit our support page: {SUPPORT_URL}"

# 7. FASTAPI SETUP ────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.get("/")
def root(): return {"status": f"{BOT_NAME} backend running"}

@app.options("/chat")
async def options_chat(): return JSONResponse(content={}, status_code=204)

@app.post("/chat")
async def chat(req: Request):
    payload = await req.json()

    if payload.get("token") != API_TOKEN:
        raise HTTPException(401, "Unauthorized – bad token")

    client_ip = req.client.host or "unknown"
    if rate_limited(client_ip):
        raise HTTPException(429, "Too many requests – slow down.")

    user_q = str(payload.get("question", "")).strip()
    if not user_q:
        return {"answer": "Please type a question 🙂"}

    try:
        bot_answer = answer(user_q)
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
        timestamp = datetime.datetime.utcnow().isoformat()

        if not name or not email or not chat_log:
            raise HTTPException(400, "Missing required fields.")

        supabase.table("chat_logs").insert({
            "name"      : name,
            "email"     : email,
            "chat_log"  : chat_log,
            "timestamp" : timestamp
        }).execute()

        return {"status": "Chat summary saved."}

    except Exception:
        print("❌ CRASH in /summary")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Internal error"})
