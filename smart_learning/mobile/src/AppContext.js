// Who is logged in, which tab and screen are showing, and short pop-up messages.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { apiGet, setUnauthorizedHandler } from './api';
import { getItem, setItem, removeItem } from './storage';

const TOKEN_KEY = 'smart-learning-token';
// Automatic sign-out after 30 minutes without a touch, also when the app was in the
// background or closed that long, so a phone left lying around doesn't stay signed in.
export const IDLE_MINUTES = 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const ACTIVE_KEY = 'smart-learning-last-active';
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null); // { token, user } once logged in
  const [pending, setPending] = useState(null); // { token, user } while a temporary password is replaced
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState(null);
  const [stack, setStack] = useState([]); // screens opened on top of the tab: [{ name, params }]
  const [toast, setToast] = useState(null);
  const [signedOutIdle, setSignedOutIdle] = useState(false); // shows a note on the login screen
  const toastTimer = useRef(null);
  const lastActive = useRef(Date.now());
  const lastSaved = useRef(0);

  const logout = useCallback(() => {
    removeItem(TOKEN_KEY);
    removeItem(ACTIVE_KEY);
    setSession(null);
    setPending(null);
    setStack([]);
    setTab(null);
  }, []);

  // every touch counts as activity (saved at most once a minute, for a restart of the app)
  const touch = useCallback(() => {
    const now = Date.now();
    lastActive.current = now;
    if (now - lastSaved.current > 60 * 1000) {
      lastSaved.current = now;
      setItem(ACTIVE_KEY, String(now));
    }
  }, []);

  const signedIn = Boolean(session);
  useEffect(() => {
    if (!signedIn) return undefined;
    lastSaved.current = 0;
    touch();
    const checkIdle = () => {
      if (Date.now() - lastActive.current < IDLE_MS) return;
      logout();
      setSignedOutIdle(true);
    };
    const timer = setInterval(checkIdle, 15 * 1000);
    // coming back to the app after a long time away
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') checkIdle(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [signedIn, touch, logout]);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  // the login kept from last time, if the backend still accepts it
  useEffect(() => {
    (async () => {
      const token = await getItem(TOKEN_KEY);
      const last = Number(await getItem(ACTIVE_KEY)) || 0;
      if (token && last && Date.now() - last >= IDLE_MS) {
        // closed and left alone too long: signed out, as if the app had stayed open
        await removeItem(TOKEN_KEY);
        await removeItem(ACTIVE_KEY);
        setSignedOutIdle(true);
      } else if (token) {
        const { data } = await apiGet('/auth/me', token);
        if (data && data.user.mustChangePassword) setPending({ token, user: data.user });
        else if (data) setSession({ token, user: data.user });
        else await removeItem(TOKEN_KEY);
      }
      setRestoring(false);
    })();
  }, []);

  // after a login or a password change: { token, user, mustChangePassword }
  const enter = useCallback((data) => {
    if (data.mustChangePassword || data.user.mustChangePassword) {
      setPending({ token: data.token, user: data.user });
      return;
    }
    setItem(TOKEN_KEY, data.token);
    setSignedOutIdle(false);
    setPending(null);
    setStack([]);
    setTab(null);
    setSession({ token: data.token, user: data.user });
  }, []);

  const updateUser = useCallback((user) => setSession((s) => s && { ...s, user: { ...s.user, ...user } }), []);
  const replaceToken = useCallback((token) => {
    setItem(TOKEN_KEY, token);
    setSession((s) => s && { ...s, token });
  }, []);

  const push = useCallback((name, params = {}) => setStack((s) => [...s, { name, params }]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const switchTab = useCallback((id) => { setStack([]); setTab(id); }, []);

  const showToast = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const value = useMemo(() => ({
    session, token: session && session.token, user: session && session.user, pending, restoring,
    enter, logout, updateUser, replaceToken, cancelPending: () => setPending(null),
    tab, switchTab, stack, push, pop, toast, showToast, touch, signedOutIdle,
  }), [session, pending, restoring, enter, logout, updateUser, replaceToken, tab, switchTab, stack, push, pop, toast, showToast, touch, signedOutIdle]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
