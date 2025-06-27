
import openai
import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Set up API keys and Supabase URL
openai.api_key = os.getenv("OPENAI_API_KEY")
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Load the knowledge base from the text file
with open("knowledge.txt", "r", encoding="utf-8") as f:
    knowledge_text = f.read()

# Create embedding using OpenAI
print("Creating Embedding...")
embedding_response = openai.Embedding.create(
    input=[knowledge_text],
    model="text-embedding-ada-002"
)
embedding = embedding_response["data"][0]["embedding"]

# Upload to Supabase
print("🚀 Uploading to Supabase...")
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json"
}

data = {
    "content": knowledge_text,
    "embedding": embedding
}

response = requests.post(f"{supabase_url}/rest/v1/smoothietexts_ai", headers=headers, json=data)

if response.status_code == 201:
    print("✅ Upload successful!")
else:
    print(f"❌ Upload failed: {response.status_code} - {response.text}")
