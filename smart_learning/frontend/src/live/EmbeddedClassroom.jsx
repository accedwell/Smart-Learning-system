import { useEffect, useState } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { apiGet, errorText } from '../services/api.js'
import LiveClassroom from './LiveClassroom.jsx'

// The live classroom on its own, for the mobile app: the app shows this page inside itself
// (no browser, no second login) at /#classroom=<id>, and hands over its sign-in in
// window.SMART_LEARNING_EMBED = { token } before the page loads. Leaving tells the app to
// close the classroom.

// the online class to open, when this page was opened by the mobile app
export function embeddedClassroomId(){
  const embed = window.SMART_LEARNING_EMBED;
  const id = Number(new URLSearchParams(window.location.hash.slice(1)).get('classroom'));
  return embed && embed.token && Number.isInteger(id) && id > 0 ? id : null;
}

function backToApp(){
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('leave');
}

export default function EmbeddedClassroom({ id }){
  const { update } = useStore();
  const { t } = useI18n();
  const [onlineClass, setOnlineClass] = useState(null);
  const [error, setError] = useState(null);

  // who is signed in, and the online class from their list (as the dashboards' cards have it)
  useEffect(()=>{
    const { token } = window.SMART_LEARNING_EMBED;
    let cancelled = false;
    (async ()=>{
      const me = await apiGet('/auth/me', token);
      if(cancelled) return;
      if(!me.data) return setError(errorText(t, me.error));
      const user = me.data.user;
      const list = user.role==='learner' || user.role==='teacher' ? await apiGet(`/${user.role}/online-classes`, token) : null;
      if(cancelled) return;
      if(list && list.error) return setError(errorText(t, list.error));
      const oc = list && list.data.onlineClasses.find(o=>o.id===id);
      if(!oc) return setError(t('live_not_open'));
      update(s=>{
        s.auth = { ...s.auth, loggedIn:true, token, apiUserId:user.id, name:user.name, email:user.email, role:user.role };
        s.role = user.role;
      });
      setOnlineClass(oc);
    })();
    return ()=>{ cancelled = true; };
  // runs once, for the class the app opened
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="embedded-classroom">
      {error ? (
        <div className="card live-closed">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={backToApp}>{t('live_back_btn')}</button>
        </div>
      ) : onlineClass ? (
        <LiveClassroom onlineClass={onlineClass} onLeave={backToApp}/>
      ) : (
        <p className="muted">{t('live_status_connecting')}</p>
      )}
    </div>
  );
}
