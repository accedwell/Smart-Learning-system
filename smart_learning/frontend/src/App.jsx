import { useEffect, useState } from 'react'
import { useStore } from './store/AppStore.jsx'
import { findAccount } from './services/accounts.js'
import Landing from './auth/Landing.jsx'
import Login from './auth/Login.jsx'
import Signup from './auth/Signup.jsx'
import ForgotPassword from './auth/ForgotPassword.jsx'
import ResetPassword from './auth/ResetPassword.jsx'
import FirstLoginPassword from './auth/FirstLoginPassword.jsx'
import AppShell from './layout/AppShell.jsx'
import ChatWidget from './layout/ChatWidget.jsx'

export default function App(){
  const { state, update } = useStore();
  // the password-reset email links to /?reset=<token>
  const [resetToken] = useState(()=>new URLSearchParams(window.location.search).get('reset'));
  const [screen, setScreen] = useState(resetToken ? 'reset' : 'landing'); // 'landing' | 'login' | 'signup' | 'forgot' | 'reset' | 'first-login'
  const [pendingLogin, setPendingLogin] = useState(null); // { accountId, extra } while a temporary password is being replaced
  const loggedIn = state.auth.loggedIn;

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
      // the teacher's quiz/paper builders default to the subject this account teaches
      if(account.role==='teacher' && account.subjectKey){
        s.teacher.quizDraft.subjectKey = account.subjectKey;
        s.teacher.paperDraft.subjectKey = account.subjectKey;
      }
    });
  }

  // email + password only: the account decides the role (and a learner's grade)
  function handleLogin({ email, password }){
    const account = findAccount(state.admin.users, email);
    if(!account || account.password!==password) return { key:'login_error_password' };
    if(account.mustChangePassword){
      setPendingLogin({ accountId:account.id, extra:{} });
      setScreen('first-login');
      return null;
    }
    enterWithAccount(account, {});
    return null;
  }

  function handleSignup({ name, email, role, grade, password, extra }){
    if(findAccount(state.admin.users, email)) return { key:'signup_error_email_taken' };
    const account = { id:state.admin.nextUserId, name, email, role, password, mustChangePassword:false, ...(role==='learner' ? { grade, ...extra } : {}) };
    update(s=>{
      s.admin.users.push(account);
      s.admin.nextUserId++;
    });
    enterWithAccount(account, extra);
    return null;
  }

  function finishFirstLogin(newPassword){
    const account = state.admin.users.find(u=>u.id===pendingLogin.accountId);
    update(s=>{
      const u = s.admin.users.find(x=>x.id===account.id);
      u.password = newPassword;
      u.mustChangePassword = false;
    });
    enterWithAccount(account, pendingLogin.extra);
    setPendingLogin(null);
  }

  function logout(){
    update(s=>{ s.auth = { loggedIn:false, name:'', role:'learner', grade:'10' }; });
    setScreen('landing');
  }

  if(loggedIn){
    return (
      <>
        <AppShell onLogout={logout}/>
        <ChatWidget/>
      </>
    );
  }
  // once someone leaves the reset screen, drop the token from the address bar
  const leaveReset = ()=>{ if(window.location.search) window.history.replaceState(null, '', window.location.pathname); };
  const home = ()=>{ leaveReset(); setScreen('landing'); };
  const toLogin = ()=>{ leaveReset(); setPendingLogin(null); setScreen('login'); };
  const pendingAccount = pendingLogin && state.admin.users.find(u=>u.id===pendingLogin.accountId);
  if(screen==='first-login' && pendingAccount) return <FirstLoginPassword account={pendingAccount} onSave={finishFirstLogin} onCancel={toLogin}/>;
  if(screen==='login') return <Login onSubmit={handleLogin} onSignup={()=>setScreen('signup')} onForgot={()=>setScreen('forgot')}/>;
  if(screen==='signup') return <Signup onSubmit={handleSignup} onLogin={toLogin} onHome={home}/>;
  if(screen==='reset' && resetToken) return <ResetPassword token={resetToken} onLogin={toLogin} onForgot={()=>{ leaveReset(); setScreen('forgot'); }}/>;
  if(screen==='forgot') return <ForgotPassword onLogin={toLogin} onHome={home}/>;
  return <Landing onLogin={toLogin} onSignup={()=>setScreen('signup')}/>;
}
