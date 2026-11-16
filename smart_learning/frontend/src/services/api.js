import { UI } from '../i18n/strings.js'

// Calls to the backend API (smart_learning/backend), proxied by vite.config.js.
// Resolves to { data } or { error: { code, message, vars } }; error codes are i18n keys
// where one exists, so screens can show t(error.code, error.vars).
// `token` is the sign-in token from POST /auth/login (state.auth.token).

// The backend's address: VITE_API_URL when the website and the backend are on different sites
// (e.g. https://smart-learning-api.onrender.com), otherwise this site's own /api.
export const SERVER = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
// "/api/papers/3/file" (as the backend writes its links) -> where to fetch it
export const serverUrl = (path)=>SERVER+path;

// A random id this browser keeps, sent with every request, so the backend can tell a sign-in
// from a new device (and email a login alert). It identifies the browser, never the person.
const DEVICE_KEY = 'smart-learning-device';
let deviceId = null;
function getDeviceId(){
  if(deviceId) return deviceId;
  try{ deviceId = localStorage.getItem(DEVICE_KEY); } catch{ /* not kept: a new id each visit */ }
  if(!deviceId){
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    deviceId = Array.from(bytes, b=>b.toString(16).padStart(2, '0')).join('');
    try{ localStorage.setItem(DEVICE_KEY, deviceId); } catch{ /* not kept */ }
  }
  return deviceId;
}

export async function apiRequest(method, path, { body, token } = {}){
  try{
    const headers = { 'X-Device-Id':getDeviceId() };
    if(body!==undefined) headers['Content-Type'] = 'application/json';
    if(token) headers.Authorization = 'Bearer '+token;
    const res = await fetch(serverUrl('/api'+path), {
      method,
      headers,
      body: body===undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(()=>null);
    if(!res.ok) return { error:(data && data.error) || { code:'api_error_server' } };
    return { data };
  } catch{
    return { error:{ code:'api_error_network' } };
  }
}

export function apiGet(path, token){
  return apiRequest('GET', path, { token });
}

export function apiPost(path, body, token){
  return apiRequest('POST', path, { body: body||{}, token });
}

export function apiPatch(path, body, token){
  return apiRequest('PATCH', path, { body: body||{}, token });
}

// multipart/form-data upload (the browser sets the boundary); same answer shape as apiRequest
export async function apiUpload(path, formData, token){
  try{
    const res = await fetch(serverUrl('/api'+path), {
      method:'POST',
      headers: token ? { Authorization:'Bearer '+token } : {},
      body: formData,
    });
    const data = await res.json().catch(()=>null);
    if(!res.ok) return { error:(data && data.error) || { code:'api_error_server' } };
    return { data };
  } catch{
    return { error:{ code:'api_error_network' } };
  }
}

// the text to show for an API error: the translated string when the code is an i18n key,
// otherwise the server's own message
export function errorText(t, error){
  if(UI[error.code]) return t(error.code, error.vars);
  return error.message || t('api_error_server');
}
