"""Chat with Gemini in the terminal, to try the API key on its own.

The key comes from GEMINI_API_KEY in ../backend/.env (the same one the app's chat bubble uses),
so it never has to be written into the code.

Run:  .venv\\Scripts\\python terminal_chat.py
"""
import os
from pathlib import Path

from google import genai

ENV = Path(__file__).resolve().parent.parent / "backend" / ".env"
for line in ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []:
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

api_key = os.environ.get("GEMINI_API_KEY", "")
if not api_key:
    raise SystemExit("GEMINI_API_KEY is empty: get a free key at https://aistudio.google.com/apikey "
                     "and put it in backend/.env as GEMINI_API_KEY=...")

client = genai.Client(api_key=api_key)
chat = client.chats.create(model=os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash")

print("Chatbot ready! Type 'quit' to exit.")
while True:
    message = input("You: ")
    if message.lower() == "quit":
        break
    response = chat.send_message(message)
    print("Bot:", response.text)
