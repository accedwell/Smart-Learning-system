"""Google Gemini, through Google's official `google-genai` package. Gemini's free tier needs only a
key from https://aistudio.google.com/apikey (no card). Set GEMINI_API_KEY (and optionally
GEMINI_MODEL) in backend/.env.

Note: Google may use free-tier prompts and replies to improve its products, so learners should not
type personal details into the chat while the school is on the free tier.
"""
from google import genai
from google.genai import errors, types

_clients: dict[str, genai.Client] = {}


class GeminiError(Exception):
    """`code` is the app's error code: ai_unavailable (bad key, no access), ai_busy (free limit
    reached, try later) or upstream_error."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _client(api_key: str) -> genai.Client:
    if api_key not in _clients:
        _clients[api_key] = genai.Client(api_key=api_key)
    return _clients[api_key]


def _as_error(exc: Exception) -> GeminiError:
    status = getattr(exc, "code", None)
    if status == 429:
        return GeminiError("ai_busy", "Gemini's limit is reached for now (HTTP 429)")
    if status in (400, 401, 403, 404):
        return GeminiError("ai_unavailable", f"Gemini refused the request (HTTP {status}): {getattr(exc, 'message', exc)}")
    if isinstance(exc, errors.APIError):
        return GeminiError("upstream_error", f"Gemini had a problem (HTTP {status})")
    return GeminiError("ai_unavailable", f"Could not reach Gemini: {exc}")


def stream_reply(api_key: str, model: str, system: str, messages: list[dict], max_tokens: int):
    """Yields the reply a piece at a time. messages: [{role: 'user'|'assistant', content}]."""
    contents = [
        # Gemini calls the assistant's turns "model"
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in messages
    ]
    config = types.GenerateContentConfig(
        system_instruction=system, max_output_tokens=max_tokens,
        # plain chat: no tools for Gemini to call
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    try:
        for chunk in _client(api_key).models.generate_content_stream(model=model, contents=contents, config=config):
            if chunk.text:
                yield chunk.text
    except GeminiError:
        raise
    except Exception as exc:  # the SDK raises its own errors, or network errors from underneath
        raise _as_error(exc) from None
