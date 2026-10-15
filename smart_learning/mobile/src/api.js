// Talks to the Smart Learning backend (smart_learning/backend).
//
// Where the backend is: EXPO_PUBLIC_API_URL if set (e.g. in mobile/.env), otherwise the computer
// that runs `npx expo start` — the phone already reaches it on the same Wi-Fi — on port 4001.
import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';

function apiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  return `http://${host || 'localhost'}:4001/api`;
}

export const API_URL = apiBase();

let onUnauthorized = null;
// called when the backend no longer accepts the token (expired, or the password changed)
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// resolves to { data } or { error: { code, message, vars? } }; never throws
export async function apiRequest(method, path, { body, token } = {}) {
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 204) return { data: {} };
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token && onUnauthorized) onUnauthorized();
      return { error: (json && json.error) || { code: 'api_error_server' } };
    }
    return { data: json };
  } catch {
    return { error: { code: 'api_error_network' } };
  }
}

export const apiGet = (path, token) => apiRequest('GET', path, { token });
export const apiPost = (path, body, token) => apiRequest('POST', path, { body: body || {}, token });
export const apiPatch = (path, body, token) => apiRequest('PATCH', path, { body: body || {}, token });
export const apiPut = (path, body, token) => apiRequest('PUT', path, { body: body || {}, token });
export const apiDelete = (path, token) => apiRequest('DELETE', path, { token });

// the error as text in the person's language
export function errorText(t, has, error) {
  if (has(error.code)) return t(error.code, error.vars);
  return error.message || t('api_error_server');
}

// Loads `path` when the screen opens (and again on reload()); { data, error, loading, reload }
export function useLoad(path, token, t, has) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const reload = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await apiGet(path, token);
    if (alive.current) setState({ data: data || null, error: error ? errorText(t, has, error) : null, loading: false });
  }, [path, token, t, has]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
