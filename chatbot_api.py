# File: chatbot_api.py
# ─────────────────────────────────────────────────────────────────────────────
# 247Chatbot backend (Multi-client config + Supabase logging)
# ─────────────────────────────────────────────────────────────────────────────

import os
import ast
import re
import time
import traceback
import collections
import datetime
import requests
import json
from typing import List, Tuple

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client
from openai import OpenAI

# ─── 1. Load & Validate ENV ───────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
API_TOKEN       = os.getenv("API_TOKEN")
CONFIG_URL_BASE = os.getenv("CONFIG_URL_BASE") or "https://two47convo.onrender.com/configs"
TABLE_KB        = os.getenv("SUPABASE_TABLE_NAME_KB")  or "client_knowledge_base"
TABLE_LOG       = os.getenv("SUPABASE_TABLE_NAME_LOG") or "client_conversations"

if not (SUPABASE_URL and SUPABASE_KEY and API_TOKEN):
    raise RuntimeError("❌ Missing one or more critical env-vars: SUPABASE_URL, SUPABASE_KEY, or API_TOKEN")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def _mask(s: str) -> str:
    return f"{s[:4]}…{s[-4:]}" if s else "❌ NONE"

print(
    "🔧 ENV →",
    "| SUPABASE_URL", SUPABASE_URL,
    "| KB TABLE", TABLE_KB,
    "| LOG TABLE", TABLE_LOG,
    "| API_TOKEN", _mask(API_TOKEN)
)

# ─── 2. FastAPI & CORS ─────────────────────────────────────────────────────────
app = FastAPI()

# Allow all origins without credentials (so wildcard CORS header is emitted)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend assets under /static
app.mount("/static", StaticFiles(directory="static"), name="static")

# ─── 3. Config Loading & OpenAI Client ────────────────────────────────────────
def fetch_config(client_id: str) -> dict:
    try:
        resp = requests.get(f"{CONFIG_URL_BASE}/{client_id}.json")
        return resp.json() if resp.ok else {}
    except:
        return {}

def get_openai_client(client_id: str) -> OpenAI:
    key_env = f"OPENAI_API_KEY_{client_id.replace('-', '_').upper()}"
    key = os.getenv(key_env, os.getenv("OPENAI_API_KEY"))
    if not key:
        raise RuntimeError(f"❌ No OpenAI key found for client '{client_id}'")
    return OpenAI(api_key=key)

# ─── 4. Embedding & Similarity ─────────────────────────────────────────────────
def get_embedding(text: str, client: OpenAI) -> List[float]:
    result = client.embeddings.create(model="text-embedding-ada-002", input=[text])
    return result.data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a_arr, b_arr = np.array(a), np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q: str, client_id: str, openai_client: OpenAI) -> Tuple[str, float]:
    q_emb = get_embedding(q, openai_client)
    rows = (
        supabase.table(TABLE_KB)
        .select("*")
        .eq("client_id", client_id)
        .execute()
        .data or []
    )
    best, best_score = "", -1.0
    for r in rows:
        try:
            emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
            score = cosine(q_emb, emb)
            if score > best_score:
                best, best_score = r["content"], score
        except:
            continue
    return best, best_score

# ─── 5. Greeting Detector & Rate Limit ────────────────────────────────────────
GREETING_RE = re.compile(
    r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening)|what'?s up)\b", re.I
)

def is_greeting(text: str) -> bool:
    return bool(GREETING_RE.search(text.strip()))

RATE_LIMIT, RATE_PERIOD = 30, 60
_ip_hits: dict[str, collections.deque] = {}

def rate_limited(ip: str) -> bool:
    now_ts = time.time()
    bucket = _ip_hits.setdefault(ip, collections.deque())
    while bucket and now_ts - bucket[0] > RATE_PERIOD:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        return True
    bucket.append(now_ts)
    return False

# ─── 6. Answer Logic ──────────────────────────────────────────────────────────
def answer(user_q: str, client_id: str, config: dict, openai_client: OpenAI) -> str:
    ctx, score = fetch_best_match(user_q, client_id, openai_client)

    if score >= SIM_THRESHOLD:
        prompt = (
            f"You are {config.get('chatbotName','Chatbot')}, the AI assistant for {config.get('brandName','')}. "
            "Answer using ONLY the knowledge below:\n\n"
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
                {"role": "system", "content": f"You are {config.get('chatbotName','Chatbot')}, a friendly assistant."},
                {"role": "user", "content": user_q}
            ]
        )
        return chat.choices[0].message.content.strip()

    return (
        f"Sorry, I couldn’t find that in my knowledge base. "
        f"Visit: {config.get('supportUrl','#')}"
    )

# ─── 7. API Routes ────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "247Chatbot backend running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.options("/chat")
async def options_chat():
    return JSONResponse({}, status_code=204)

@app.post("/chat")
async def chat_endpoint(req: Request):
    payload = await req.json()
    if payload.get("token") != API_TOKEN:
        raise HTTPException(401, "Unauthorized – bad token")

    client_id = payload.get("client_id","").strip()
    if not client_id:
        raise HTTPException(400, "Missing client_id")

    client_ip = req.client.host or "unknown"
    if rate_limited(client_ip):
        raise HTTPException(429, "Too many requests")

    question = str(payload.get("question","")).strip()
    if not question:
        return {"answer": "Please ask a question 🙂"}

    try:
        cfg = fetch_config(client_id)
        oa = get_openai_client(client_id)
        resp = answer(question, client_id, cfg, oa)
        return {"answer": resp}
    except Exception:
        traceback.print_exc()
        return {"answer": "Something went wrong. Please try again later."}

@app.post("/summary")
async def summary_endpoint(req: Request):
    payload = await req.json()
    if payload.get("token") != API_TOKEN:
        raise HTTPException(401, "Unauthorized – bad token")

    name      = payload.get("name","").strip()
    email     = payload.get("email","").strip()
    chat_log  = payload.get("chat_log","")
    client_id = payload.get("client_id","").strip()
    timestamp = datetime.datetime.utcnow().isoformat()

    if not (name and email and chat_log and client_id):
        raise HTTPException(400, "Missing required fields")

    supabase.table(TABLE_LOG).insert({
        "name": name,
        "email": email,
        "chat_log": chat_log,
        "client_id": client_id,
        "timestamp": timestamp
    }).execute()

    return {"status": "Chat summary saved."}

# ─── 8. Config JSON Endpoint ──────────────────────────────────────────────────
@app.get("/configs/{client_id}.json")
async def get_config_file(client_id: str):
    path = os.path.join("configs", f"{client_id}.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Config not found")
    return FileResponse(path, media_type="application/json")
