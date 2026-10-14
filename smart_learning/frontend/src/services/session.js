// The sign-in token is kept in this tab's sessionStorage, so a page refresh doesn't log the
// person out, while closing the tab (or the browser) does. Storage can be unavailable (some
// private windows): then the person simply logs in again after a refresh.
const TOKEN_KEY = 'smart-learning-session';

export function savedToken(){
  try{ return sessionStorage.getItem(TOKEN_KEY); } catch{ return null; }
}

export function rememberToken(token){
  try{ sessionStorage.setItem(TOKEN_KEY, token); } catch{ /* not remembered */ }
}

export function forgetToken(){
  try{ sessionStorage.removeItem(TOKEN_KEY); } catch{ /* nothing to forget */ }
}
