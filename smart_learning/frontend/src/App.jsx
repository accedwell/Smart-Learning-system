import { useEffect, useState } from 'react'
import { useStore } from './store/AppStore.jsx'
import { findAccount } from './services/accounts.js'
import { apiGet, apiPost, errorText } from './services/api.js'
import { savedToken, rememberToken, forgetToken } from './services/session.js'
import { useI18n } from './i18n/I18nContext.jsx'
import Landing from './auth/Landing.jsx'
import Login from './auth/Login.jsx'
import ForgotPassword from './auth/ForgotPassword.jsx'
import ResetPassword from './auth/ResetPassword.jsx'
import FirstLoginPassword from './auth/FirstLoginPassword.jsx'
import AppShell from './layout/AppShell.jsx'
import ChatWidget from './layout/ChatWidget.jsx'
import { makeEmptyQuizDraft, makeEmptyPaperDraft } from '../teacher/drafts.js'

// The password-reset email links to /#reset=<token>. The token is taken out of the address
// bar (and so out of the browser history) as soon as it is read.
function takeResetToken(){
  const token = new URLSearchParams(window.location.hash.slice(1)).get('reset');
  if(token) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}
const initialResetToken = takeResetToken();

export default function App(){
  const { state, update } = useStore();
  const { t } = useI18n();
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [screen, setScreen] = useState(initialResetToken ? 'reset' : 'landing'); // 'landing' | 'login' | 'forgot' | 'reset' | 'first-login'
  const [pendingLogin, setPendingLogin] = useState(null); // the backend session ({ token, user }) while a temporary password is being replaced
  // true while a sign-in remembered from before a page refresh is being checked
  const [restoring, setRestoring] = useState(()=>Boolean(savedToken()));
  const loggedIn = state.auth.loggedIn;

  // after a page refresh: the sign-in kept for this tab is checked with the backend and, if it
  // is still valid, the person goes straight back to their dashboard
  useEffect(()=>{
    const token = savedToken();
    if(!token) return;
    let cancelled = false;
    apiGet('/auth/me', token).then(({ data })=>{
      if(cancelled) return;
      if(!data) forgetToken(); // expired, or the password changed since
      else if(data.user.mustChangePassword){ setPendingLogin({ token, user:data.user }); setScreen('first-login'); }
      else enterWithSession({ token, user:data.user });
      setRestoring(false);
    });
    return ()=>{ cancelled = true; };
  // runs once, on page load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a reset link opened in a tab already showing the app changes only the #, without a reload
  useEffect(()=>{
    const onHashChange = ()=>{
      const token = takeResetToken();
      if(token){ setResetToken(token); setScreen('reset'); }
    };
    window.addEventListener('hashchange', onHashChange);
    return ()=>window.removeEventListener('hashchange', onHashChange);
  }, []);

  // the dashboard background photo only shows once someone is logged in
  useEffect(()=>{
    document.body.classList.toggle('in-app', loggedIn);
    // lets each role's dashboard have its own background (see body.in-app[data-role] in the CSS)
    if(loggedIn) document.body.dataset.role = state.role;
    else delete document.body.dataset.role;
  }, [loggedIn, state.role]);

  // opens the dashboard for a known account, carrying its role details into the app
  function enterWithAccount(account, extra){
    update(s=>{
      s.auth = { loggedIn:true, userId:account.id, name:account.name, email:account.email, role:account.role, grade:account.grade||'10', ...extra };
      s.role = account.role;
      if(account.role==='hod' && account.dept) s.hod.dept = account.dept;
      // a teacher starts from blank builders, so nothing picked for another teacher's classes carries over
      if(account.role==='teacher'){
        s.teacher.tab = 'class';
        s.teacher.quizDraft = makeEmptyQuizDraft();
        s.teacher.paperDraft = makeEmptyPaperDraft();
        s.teacher.classFilter = 'all';
        s.teacher.showResultsFor = null;
        s.teacher.quizClassError = s.teacher.paperClassError = false;
      }
    });
  }

  // Opens the app for a backend session. The token (state.auth.token) is what the connected
  // dashboards (so far the HOD's) send to the API. Dashboards still on the in-browser demo
  // data find their records by the matching demo account's id, so that id is kept when the
  // email matches one.
  function enterWithSession({ token, user }){
    const local = findAccount(state.admin.users, user.email);
    const account = {
      id: local ? local.id : user.id,
      name: user.name, email: user.email, role: user.role,
      grade: user.grade || (local && local.grade),
      dept: user.dept || (local && local.dept),
    };
    enterWithAccount(account, { token, apiUserId:user.id });
    rememberToken(token);
  }

  // email + password only: the account decides the role (and a learner's grade)
  async function handleLogin({ email, password }){
    const { data, error } = await apiPost('/auth/login', { email, password });
    if(error) return { text:errorText(t, error) };
    if(data.mustChangePassword){
      setPendingLogin(data);
      setScreen('first-login');
      return null;
    }
    enterWithSession(data);
    return null;
  }

  // resolves to an error message, or nothing once the new password is saved
  async function finishFirstLogin(newPassword){
    const { data, error } = await apiPost('/auth/change-password', { newPassword }, pendingLogin.token);
    if(error) return errorText(t, error);
    enterWithSession(data);
    setPendingLogin(null);
  }

  function logout(){
    forgetToken();
    update(s=>{ s.auth = { loggedIn:false, name:'', role:'learner', grade:'10' }; });
    setScreen('landing');
  }

  if(restoring) return null;
  if(loggedIn){
    return (
      <>
        <AppShell onLogout={logout}/>
        <ChatWidget/>
      </>
    );
  }
  const home = ()=>setScreen('landing');
  const toLogin = ()=>{ setPendingLogin(null); setScreen('login'); };
  if(screen==='first-login' && pendingLogin) return <FirstLoginPassword account={pendingLogin.user} onSave={finishFirstLogin} onCancel={toLogin}/>;
  if(screen==='login') return <Login onSubmit={handleLogin} onForgot={()=>setScreen('forgot')} onHome={home}/>;
  if(screen==='reset' && resetToken) return <ResetPassword token={resetToken} onLogin={toLogin} onForgot={()=>setScreen('forgot')}/>;
  if(screen==='forgot') return <ForgotPassword onLogin={toLogin} onHome={home}/>;
  return <Landing onLogin={toLogin}/>;
}
