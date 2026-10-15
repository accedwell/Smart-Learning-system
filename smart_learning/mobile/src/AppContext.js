// Who is logged in, which tab and screen are showing, and short pop-up messages.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, setUnauthorizedHandler } from './api';
import { getItem, setItem, removeItem } from './storage';

const TOKEN_KEY = 'smart-learning-token';
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null); // { token, user } once logged in
  const [pending, setPending] = useState(null); // { token, user } while a temporary password is replaced
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState(null);
  const [stack, setStack] = useState([]); // screens opened on top of the tab: [{ name, params }]
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const logout = useCallback(() => {
    removeItem(TOKEN_KEY);
    setSession(null);
    setPending(null);
    setStack([]);
    setTab(null);
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  // the login kept from last time, if the backend still accepts it
  useEffect(() => {
    (async () => {
      const token = await getItem(TOKEN_KEY);
      if (token) {
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
    tab, switchTab, stack, push, pop, toast, showToast,
  }), [session, pending, restoring, enter, logout, updateUser, replaceToken, tab, switchTab, stack, push, pop, toast, showToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
