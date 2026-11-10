// Talks to the Smart Learning backend (smart_learning/backend).
//
// Where the backend is: EXPO_PUBLIC_API_URL if set (e.g. in mobile/.env), otherwise the computer
// that runs `npx expo start` — the phone already reaches it on the same Wi-Fi — on port 4001.
// Through a tunnel (`npm run tunnel`) it is the tunnel's https address, where Metro passes
// /api on to the backend (metro.config.js). In the installed app (APK) the person can also type
// the server's address on the login screen (setServer), which is kept on the phone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getItem, removeItem, setItem } from './storage';

const HOST = (Constants.expoConfig?.hostUri || '').split(':')[0];
export const TUNNEL = HOST.endsWith('.exp.direct');

function apiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  // opened in a browser: Metro, which served the page, passes /api on to the backend
  // (metro.config.js), so the same address works on the computer and through the tunnel
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) return window.location.origin + '/api';
  if (TUNNEL) return `https://${HOST}/api`;
  return `http://${HOST || 'localhost'}:4001/api`;
}

export let API_URL = apiBase();

const SERVER_KEY = 'smart-learning-server';

// the address typed on the login screen, if any, replaces the built-in one
export async function loadServer() {
  const saved = await getItem(SERVER_KEY).catch(() => null);
  if (saved) API_URL = saved;
  return API_URL;
}

// "192.168.1.20" or "192.168.1.20:4001" or "http://192.168.1.20:4001/api" -> the API address
export function serverFromInput(text) {
  let v = String(text || '').trim().replace(/\/+$/, '');
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  if (!/\/api$/i.test(v)) {
    const hostPart = v.replace(/^https?:\/\//i, '').split('/')[0];
    if (/^http:/i.test(v) && !/:\d+$/.test(hostPart)) v += ':4001';
    v += '/api';
  }
  return /^https?:\/\/[^/\s]+\/(.+\/)?api$/i.test(v) ? v : null;
}

// `url` from serverFromInput, or null for the built-in address again
export async function setServer(url) {
  if (url) {
    API_URL = url;
    await setItem(SERVER_KEY, url);
  } else {
    API_URL = apiBase();
    await removeItem(SERVER_KEY);
  }
}

// whether Smart Learning answers at `url` (within a few seconds)
export async function checkServer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url + '/catalog', { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let onUnauthorized = null;
// called when the backend no longer accepts the token (expired, or the password changed)
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// A random id this phone keeps, sent with every request, so the backend can tell a sign-in
// from a new device (and email a login alert). It identifies the phone, never the person.
const DEVICE_KEY = 'smart-learning-device';
let deviceId = null;
async function getDeviceId() {
  if (deviceId) return deviceId;
  deviceId = await getItem(DEVICE_KEY).catch(() => null);
  if (!deviceId) {
    deviceId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    await setItem(DEVICE_KEY, deviceId).catch(() => {});
  }
  return deviceId;
}

// resolves to { data } or { error: { code, message, vars? } }; never throws
export async function apiRequest(method, path, { body, token } = {}) {
  try {
    const headers = { Accept: 'application/json', 'X-Device-Id': await getDeviceId() };
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
