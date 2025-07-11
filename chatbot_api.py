# File: chatbot_api.py
# ─────────────────────────────────────────────────────────────────────────────
# 247Chatbot backend (Multi-client config + Supabase logging)
# ─────────────────────────────────────────────────────────────────────────────

import os, time, traceback, collections, datetime, requests, ast, re, json
from typing import List, Tuple

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from supabase import create_client
from openai import OpenAI

# ─── 1. Load & Validate ENV ───────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
API_TOKEN       = os.getenv("API_TOKEN")
CONFIG_BASE     = os.getenv("CONFIG_URL_BASE") or "https://two47convobot.onrender.com/configs"
TABLE_KB        = os.getenv("SUPABASE_TABLE_NAME_KB")  or "client_knowledge_base"
TABLE_LOG       = os.getenv("SUPABASE_TABLE_NAME_LOG") or "client_conversations"

if not (SUPABASE_URL and SUPABASE_KEY and API_TOKEN):
    raise RuntimeError("❌ Missing SUPABASE_URL, SUPABASE_KEY, or API_TOKEN")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 2. App & CORS ─────────────────────────────────────────────────────────────
app = FastAPI()

# General CORS middleware for dynamic routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # allow any domain
    allow_credentials=False,    # so wildcard origin is emitted
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 3. Helpers (Config, OpenAI, Embeddings, Similarity) ─────────────────────
def fetch_config(client_id: str) -> dict:
    try:
        r = requests.get(f"{CONFIG_BASE}/{client_id}.json")
        return r.json() if r.ok else {}
    except:
        return {}

def get_openai_client(client_id: str) -> OpenAI:
    key_env = f"OPENAI_API_KEY_{client_id.replace('-', '_').upper()}"
    key = os.getenv(key_env, os.getenv("OPENAI_API_KEY"))
    if not key:
        raise RuntimeError(f"No OpenAI key for client '{client_id}'")
    return OpenAI(api_key=key)

def get_embedding(text: str, client: OpenAI) -> List[float]:
    return client.embeddings.create(
        model="text-embedding-ada-002", input=[text]
    ).data[0].embedding

def cosine(a: List[float], b: List[float]) -> float:
    a_arr, b_arr = np.array(a), np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr)*np.linalg.norm(b_arr)))

SIM_THRESHOLD = 0.60

def fetch_best_match(q, client_id, openai_client):
    q_emb = get_embedding(q, openai_client)
    rows = supabase.table(TABLE_KB).select("*").eq("client_id", client_id).execute().data or []
    best, best_score = "", -1.0
    for r in rows:
        try:
            emb = ast.literal_eval(r["embedding"]) if isinstance(r["embedding"], str) else r["embedding"]
            sc = cosine(q_emb, emb)
            if sc > best_score:
                best, best_score = r["content"], sc
        except:
            pass
    return best, best_score

GREETING_RE = re.compile(r"\b(hi|hello|hey|howdy|good\s?(morning|afternoon|evening))\b", re.I)
def is_greeting(t: str) -> bool:
    return bool(GREETING_RE.search(t.strip()))

RATE_LIMIT, RATE_PERIOD = 30, 60
_hits = {}

def rate_limited(ip):
    now = time.time()
    bucket = _hits.setdefault(ip, collections.deque())
    while bucket and now - bucket[0] > RATE_PERIOD:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        return True
    bucket.append(now)
    return False

def answer(user_q, client_id, cfg, oa):
    ctx, score = fetch_best_match(user_q, client_id, oa)
    if score >= SIM_THRESHOLD:
        prompt = (
            f"You are {cfg.get('chatbotName','Chatbot')}. "
            f"Answer using ONLY this knowledge:\n\n{ctx}\n\nQ: {user_q}\nA:"
        )
        res = oa.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role":"user","content":prompt}]
        )
        return res.choices[0].message.content.strip()
    if is_greeting(user_q):
        res = oa.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
              {"role":"system","content":f"You are {cfg.get('chatbotName','Chatbot')}."},
              {"role":"user","content":user_q}
            ]
        )
        return res.choices[0].message.content.strip()
    return f"Sorry, I couldn’t find that. Visit {cfg.get('supportUrl','#')}"

# ─── 4. API Endpoints ─────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status":"running"}

@app.get("/health")
def health():
    return {"status":"ok"}

@app.options("/chat")
def opt_chat(): return JSONResponse({}, 204)

@app.post("/chat")
async def chat(req: Request):
    p = await req.json()
    if p.get("token") != API_TOKEN:
        raise HTTPException(401,"Bad token")
    cid = p.get("client_id","").strip() or HTTPException(400,"Missing client_id")
    if rate_limited(req.client.host):
        raise HTTPException(429,"Rate limit")

    q = p.get("question","").strip()
    if not q:
        return {"answer":"Please ask a question 🙂"}

    cfg = fetch_config(cid)
    oa  = get_openai_client(cid)
    try:
        ans = answer(q,cid,cfg,oa)
        return {"answer":ans}
    except Exception:
        traceback.print_exc()
        return {"answer":"Error occurred"}

@app.post("/summary")
async def summary(req: Request):
    p = await req.json()
    if p.get("token") != API_TOKEN:
        raise HTTPException(401,"Bad token")
    name,email,log,cid = p.get("name"),p.get("email"),p.get("chat_log"),p.get("client_id")
    if not all([name,email,log,cid]):
        raise HTTPException(400,"Missing fields")
    supabase.table(TABLE_LOG).insert({
        "name":name,"email":email,"chat_log":log,"client_id":cid,
        "timestamp":datetime.datetime.utcnow().isoformat()
    }).execute()
    return {"status":"saved"}

# ─── 5. Config & Static with explicit CORS headers ───────────────────────────
@app.get("/configs/{client_id}.json")
async def get_config_file(client_id:str):
    fp = os.path.join("configs",f"{client_id}.json")
    if not os.path.exists(fp):
        raise HTTPException(404,"Not found")
    data = open(fp,"rb").read()
    return Response(content=data, media_type="application/json",
                    headers={"Access-Control-Allow-Origin":"*"})

@app.get("/static/{path:path}")
async def static_file(path:str):
    fp = os.path.join("static",path)
    if not os.path.exists(fp):
        raise HTTPException(404,"Not found")
    data = open(fp,"rb").read()
    # Derive mime-type if needed, here assume text/html or application/octet-stream
    mt = "text/html" if fp.endswith(".html") else "application/octet-stream"
    return Response(content=data, media_type=mt,
                    headers={"Access-Control-Allow-Origin":"*"})

# ─────────────────────────────────────────────────────────────────────────────
