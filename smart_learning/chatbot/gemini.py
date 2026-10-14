"""Google Gemini, for schools without an Anthropic key: Gemini's free tier needs only a key from
https://aistudio.google.com/apikey (no card). Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in
backend/.env.

Note: Google may use free-tier prompts and replies to improve its products, so learners should not
type personal details into the chat while the school is on the free tier.

Uses only Python's standard library: the reply is streamed from Gemini's server-sent events.
"""
import json
import urllib.error
import urllib.request

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
TIMEOUT_S = 60


class GeminiError(Exception):
    """`code` is the app's error code: ai_unavailable (bad key, no access), ai_busy (free limit
    reached, try later) or upstream_error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def stream_reply(api_key: str, model: str, system: str, messages: list[dict], max_tokens: int):
    """Yields the reply a piece at a time. messages: [{role: 'user'|'assistant', content}]."""
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        # Gemini calls the assistant's turns "model"
        "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                     for m in messages],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    request = urllib.request.Request(
        API.format(model=model), data=json.dumps(body).encode("utf-8"), method="POST",
        # the key goes in a header, never in the address, so it stays out of logs
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    try:
        response = urllib.request.urlopen(request, timeout=TIMEOUT_S)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise GeminiError("ai_busy", "The AI assistant is busy, try again shortly") from None
        if exc.code in (400, 401, 403, 404):
            raise GeminiError("ai_unavailable", f"Gemini refused the request (HTTP {exc.code})") from None
        raise GeminiError("upstream_error", f"Gemini had a problem (HTTP {exc.code})") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GeminiError("ai_unavailable", f"Could not reach Gemini: {exc}") from None

    with response:
        for raw in response:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            chunk = json.loads(line[5:])
            for candidate in chunk.get("candidates", []):
                for part in (candidate.get("content") or {}).get("parts", []):
                    if part.get("text") and not part.get("thought"):
                        yield part["text"]
