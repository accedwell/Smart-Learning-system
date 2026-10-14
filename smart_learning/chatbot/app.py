"""Smart Learning chatbot: the support assistant behind the chat bubble, in Python.

The Node backend (smart_learning/backend) checks who is logged in and rate-limits, then forwards
each chat here with the shared CHATBOT_SECRET. This service writes the assistant's instructions and
asks Claude for the reply, streaming it back as server-sent events: `text` (a piece of the reply),
then `done` (the whole reply) or `error` ({code, message}).

Settings come from the environment, then from ../backend/.env, so there is one place to set them:
ANTHROPIC_API_KEY, CLAUDE_MODEL, AI_ENABLED, CHATBOT_SECRET, CHATBOT_PORT.

Run:  .venv\\Scripts\\python app.py
"""
import hmac
import json
import os
from pathlib import Path

import anthropic
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

BACKEND_ENV = Path(__file__).resolve().parent.parent / "backend" / ".env"


def load_env(path: Path) -> None:
    """KEY=value lines from the backend's .env; a variable already set in the environment wins."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(BACKEND_ENV)

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("CLAUDE_MODEL") or "claude-opus-5-5"
AI_ENABLED = os.environ.get("AI_ENABLED", "true") != "false"
SECRET = os.environ.get("CHATBOT_SECRET", "")
PORT = int(os.environ.get("CHATBOT_PORT", "8000"))
MAX_TOKENS = 4000

LANGUAGES = (
    "South Africa's official languages (English, Afrikaans, isiZulu, isiXhosa, isiNdebele, Sepedi, "
    "Sesotho, Setswana, siSwati, Tshivenda, Xitsonga)"
)

ROLE_NAMES = {
    "learner": "a learner", "teacher": "a teacher", "parent": "a parent or guardian",
    "hod": "a Head of Department", "principal": "the principal", "admin": "the school administrator",
}

# what each kind of user can find where, so the assistant can point them to the right place
APP_GUIDE = (
    "Smart Learning is a school platform. Learners see their lessons, take their teachers' quizzes (the "
    "first try counts towards their progress; after that they can practise), open question papers and join "
    "online classes in the app. Teachers see their classes and which learners are at risk, upload question "
    "papers or study guides (the system reads them and writes quiz questions to choose from), set quizzes, "
    "and schedule and teach online classes with a register that fills itself in. HODs follow their "
    "department's teachers and send reports to the principal. Parents follow their linked children. The "
    "administrator creates every account (nobody signs up) and sets up the classes. Forgotten passwords are "
    "reset from the login page."
)


def system_prompt(reply_language: str, user_name: str, user_role: str) -> str:
    who = f"You are talking to {user_name}, {ROLE_NAMES.get(user_role, 'a user')}." if user_name else ""
    return (
        "You are the Smart Learning support assistant, helping learners, teachers, parents and school staff. "
        f"{who} {APP_GUIDE} "
        f"You understand and can translate to and from {LANGUAGES}. "
        f"Always reply in {reply_language}: this is the person's own chosen language for this chat, so use it "
        "whatever language they type in, translating their message naturally. If they paste text and ask for a "
        "translation into another South African language, give that translation, but write the rest of your "
        f"reply in {reply_language}. Help with schoolwork by explaining and guiding rather than just giving "
        "answers to assessment questions. Keep replies concise (2-4 sentences unless a longer translation or "
        "explanation is asked for) and friendly. You cannot see or change anyone's marks or account."
    )


class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=20)
    reply_language: str = Field(default="the same language the user writes in", max_length=80)
    user_name: str = Field(default="", max_length=100)
    user_role: str = Field(default="", max_length=20)


app = FastAPI(title="Smart Learning chatbot", docs_url=None, redoc_url=None)
client = anthropic.Anthropic(api_key=API_KEY) if API_KEY else None


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def error_for(exc: Exception) -> dict:
    """Claude's failures as the app's error codes; a missing or bad key reads as 'not available'."""
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.APIConnectionError)):
        return {"code": "ai_unavailable", "message": "The AI assistant is not available right now"}
    if isinstance(exc, anthropic.RateLimitError):
        return {"code": "ai_busy", "message": "The AI assistant is busy, try again shortly"}
    return {"code": "upstream_error", "message": "The AI assistant had a problem, try again"}


@app.get("/health")
def health():
    return {"ok": True, "ai": bool(client and AI_ENABLED), "model": MODEL}


@app.post("/chat")
def chat(body: ChatRequest, x_chatbot_secret: str = Header(default="")):
    # only the Node backend, which knows the shared secret, may use this service
    if not SECRET or not hmac.compare_digest(x_chatbot_secret, SECRET):
        raise HTTPException(status_code=403, detail="forbidden")
    if not (client and AI_ENABLED):
        return JSONResponse(status_code=503, content={"error": {
            "code": "ai_unavailable", "message": "The AI assistant is not available right now"}})

    system = system_prompt(body.reply_language, body.user_name, body.user_role)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    def events():
        reply = []
        try:
            with client.messages.stream(model=MODEL, max_tokens=MAX_TOKENS, system=system, messages=messages) as stream:
                for text in stream.text_stream:
                    reply.append(text)
                    yield sse("text", {"text": text})
            yield sse("done", {"reply": "".join(reply).strip()})
        except anthropic.APIError as exc:
            yield sse("error", error_for(exc))

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    # this computer only: the Node backend is the one way in
    uvicorn.run(app, host="127.0.0.1", port=PORT)
