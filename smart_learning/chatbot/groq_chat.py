"""Groq (https://console.groq.com), through its OpenAI-style chat API. Set GROQ_API_KEY (and
optionally GROQ_MODEL) in backend/.env. The reply is streamed as server-sent events, read here with
httpx (already installed with the anthropic package).
"""
import json

import httpx

URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqError(Exception):
    """`code` is the app's error code: ai_unavailable (bad key, no access), ai_busy (limit reached,
    try later) or upstream_error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _as_error(status: int, detail: str) -> GroqError:
    if status == 429:
        return GroqError("ai_busy", "Groq's limit is reached for now (HTTP 429)")
    if status in (400, 401, 403, 404):
        return GroqError("ai_unavailable", f"Groq refused the request (HTTP {status}): {detail[:300]}")
    return GroqError("upstream_error", f"Groq had a problem (HTTP {status})")


def stream_reply(api_key: str, model: str, system: str, messages: list[dict], max_tokens: int):
    """Yields the reply a piece at a time. messages: [{role: 'user'|'assistant', content}]."""
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}] + messages,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "stream": True,
    }
    # the gpt-oss models think before they answer (kept out of the reply); "medium" keeps sums
    # right without making the learner wait long
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "medium"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.stream("POST", URL, json=body, headers=headers, timeout=httpx.Timeout(60, connect=10)) as res:
            if res.status_code != 200:
                raise _as_error(res.status_code, res.read().decode("utf-8", "replace"))
            for line in res.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                chunk = json.loads(data)
                choices = chunk.get("choices") or []
                text = (choices[0].get("delta") or {}).get("content") if choices else None
                if text:
                    yield text
    except GroqError:
        raise
    except Exception as exc:  # network errors and the like
        raise GroqError("ai_unavailable", f"Could not reach Groq: {exc}") from None
