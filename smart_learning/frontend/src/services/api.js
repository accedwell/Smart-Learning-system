// Calls to the backend API (smart_learning/backend), proxied to :4000 by vite.config.js.
// Resolves to { data } or { error: { code, message, vars } }; error codes are i18n keys
// where one exists, so screens can show t(error.code, error.vars).
export async function apiPost(path, body){
  try{
    const res = await fetch('/api'+path, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body||{}),
    });
    const data = await res.json().catch(()=>null);
    if(!res.ok) return { error:(data && data.error) || { code:'api_error_server' } };
    return { data };
  } catch{
    return { error:{ code:'api_error_network' } };
  }
}
