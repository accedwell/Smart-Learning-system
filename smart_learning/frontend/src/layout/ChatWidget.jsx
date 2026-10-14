import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/AppStore.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'
import { LanguageSelect } from '../components/ui.jsx'
import { errorText } from '../services/api.js'
import { readEvents } from '../live/liveClient.js'

// The most recent turns sent with each question, so the assistant can follow the conversation
const HISTORY = 20;

// Floating assistant, with its own reply language independent of the app's ('__system' =
// follow the app-wide language). The reply comes from the Python chatbot through the backend
// (/api/ai/chat), streamed in as it is written.
export default function ChatWidget(){
  const { state } = useStore();
  const { t, lang } = useI18n();
  const token = state.auth.token;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { id, role:'user'|'bot'|'sys', text, failed? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatLang, setChatLang] = useState('__system');
  const bodyRef = useRef(null);
  const nextId = useRef(1);

  useEffect(()=>{
    if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  function addMsg(role, text){
    const id = nextId.current++;
    setMessages(prev=>[...prev, { id, role, text }]);
    return id;
  }
  function setMsg(id, text, failed=false){
    setMessages(prev=>prev.map(m=>m.id===id ? { ...m, text, failed } : m));
  }

  function toggle(){
    if(!open && messages.length===0) addMsg('sys', t('chat_welcome'));
    setOpen(!open);
  }

  async function send(){
    const text = input.trim();
    if(!text || sending) return;
    setInput('');
    // the conversation so far: replies that worked, alternating with what the person wrote
    const history = [];
    for(const m of messages){
      if(m.role==='user') history.push({ role:'user', content:m.text });
      else if(m.role==='bot' && !m.failed && history.length && history[history.length-1].role==='user') history.push({ role:'assistant', content:m.text });
    }
    while(history.length && history[history.length-1].role==='user') history.pop();
    const turns = [...history, { role:'user', content:text }].slice(-HISTORY);
    while(turns[0].role!=='user') turns.shift();

    addMsg('user', text);
    setSending(true);
    const botId = addMsg('bot', t('chat_thinking'));
    try{
      const res = await fetch('/api/ai/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'text/event-stream', Authorization:'Bearer '+token },
        body: JSON.stringify({ messages:turns, lang: chatLang==='__system' ? lang : chatLang }),
      });
      if(!res.ok){
        const data = await res.json().catch(()=>null);
        setMsg(botId, errorText(t, (data && data.error) || { code:'chat_error' }), true);
      } else {
        let reply = '';
        let failed = null;
        await readEvents(res.body, (name, data)=>{
          if(name==='text'){ reply += data.text; setMsg(botId, reply); }
          else if(name==='done') reply = data.reply || reply;
          else if(name==='error') failed = data;
        });
        if(failed) setMsg(botId, errorText(t, failed), true);
        else setMsg(botId, reply.trim() || t('chat_error'), !reply.trim());
      }
    } catch{
      setMsg(botId, t('chat_error'), true);
    }
    setSending(false);
  }

  return (
    <>
      <button className="chat-fab" title={t('chat_title')} onClick={toggle}>&#128172;</button>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <b>{t('chat_title')}</b><br/><span className="muted2">{t('chat_sub')}</span>
          </div>
          <div className="chat-lang">
            <span className="muted">{t('chat_lang_note')}</span>
            <LanguageSelect value={chatLang} onChange={setChatLang} includeSystem style={{ flex:1 }}/>
          </div>
          <div className="chat-body" ref={bodyRef}>
            {messages.map(m=><div key={m.id} className={'msg '+m.role}>{m.text}</div>)}
          </div>
          <div className="chat-input">
            <input type="text" value={input} maxLength={4000} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') send(); }} placeholder={t('chat_placeholder')}/>
            <button className="btn btn-primary" disabled={sending} onClick={send}>{t('chat_send')}</button>
          </div>
        </div>
      )}
    </>
  );
}
