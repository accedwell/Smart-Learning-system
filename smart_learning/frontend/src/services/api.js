import { UI } from '../i18n/strings.js'

// Calls to the backend API (smart_learning/backend), proxied by vite.config.js.
// Resolves to { data } or { error: { code, message, vars } }; error codes are i18n keys
// where one exists, so screens can show t(error.code, error.vars).
// `token` is the sign-in token from POST /auth/login (state.auth.token).
export async function apiRequest(method, path, { body, token } = {}){
  try{
    const headers = {};
    if(body!==undefined) headers['Content-Type'] = 'application/json';
    if(token) headers.Authorization = 'Bearer '+token;
    const res = await fetch('/api'+path, {
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
    const res = await fetch('/api'+path, {
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
