import { useEffect, useState } from 'react'
import { useStore } from './store/AppStore.jsx'
import { findAccount } from './services/accounts.js'
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
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [screen, setScreen] = useState(initialResetToken ? 'reset' : 'landing'); // 'landing' | 'login' | 'forgot' | 'reset' | 'first-login'
  const [pendingLogin, setPendingLogin] = useState(null); // { accountId, extra } while a temporary password is being replaced
  const loggedIn = state.auth.loggedIn;

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
  const home = ()=>setScreen('landing');
  const toLogin = ()=>{ setPendingLogin(null); setScreen('login'); };
  const pendingAccount = pendingLogin && state.admin.users.find(u=>u.id===pendingLogin.accountId);
  if(screen==='first-login' && pendingAccount) return <FirstLoginPassword account={pendingAccount} onSave={finishFirstLogin} onCancel={toLogin}/>;
  if(screen==='login') return <Login onSubmit={handleLogin} onForgot={()=>setScreen('forgot')} onHome={home}/>;
  if(screen==='reset' && resetToken) return <ResetPassword token={resetToken} onLogin={toLogin} onForgot={()=>setScreen('forgot')}/>;
  if(screen==='forgot') return <ForgotPassword onLogin={toLogin} onHome={home}/>;
  return <Landing onLogin={toLogin}/>;
}
