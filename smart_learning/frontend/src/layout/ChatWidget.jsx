import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'
import { LanguageSelect } from '../components/ui.jsx'
import { getSampler } from '../services/ai.js'

// floating assistant, with its own reply language independent of the app's
// ('__system' = follow the app-wide language)
export default function ChatWidget(){
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { id, role:'user'|'bot'|'sys', text }
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
  function setMsg(id, text){
    setMessages(prev=>prev.map(m=>m.id===id ? { ...m, text } : m));
  }

  function toggle(){
    if(!open && messages.length===0) addMsg('sys', t('chat_welcome'));
    setOpen(!open);
  }

  async function send(){
    const text = input.trim();
    if(!text || sending) return;
    setInput('');
    addMsg('user', text);
    setSending(true);
    const botId = addMsg('bot', t('chat_thinking'));
    try{
      const sample = await getSampler();
      if(!sample){ setMsg(botId, t('chat_unavailable')); setSending(false); return; }
      const target = chatLang==='__system' ? (lang==='English' ? 'the same language the user writes in' : lang) : chatLang;
      const prompt = `You are the Smart Learning support assistant, helping learners, teachers, parents and school staff. `+
        `You understand and can translate to and from South Africa's official languages (English, Afrikaans, isiZulu, isiXhosa, isiNdebele, Sepedi, Sesotho, Setswana, siSwati, Tshivenda, Xitsonga). `+
        `Always reply in ${target} — this is the person's own chosen language for this chat, chosen independently of the rest of the app, so use it regardless of what language they type in, translating their message naturally. `+
        `If they explicitly paste text and ask you to translate it into a different one-off South African language, do that translation in your answer, but still write the rest of your reply (any explanation) in ${target}. `+
        `Keep replies concise (2-4 sentences unless a longer translation is requested) and friendly.\n\nUser: ${text}`;
      const res = await sample(prompt, { modelTier:'quick', cache:false, onText:({ text:partial })=>setMsg(botId, partial) });
      setMsg(botId, res.text.trim());
    } catch{
      setMsg(botId, t('chat_error'));
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
            <input type="text" value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') send(); }} placeholder={t('chat_placeholder')}/>
            <button className="btn btn-primary" onClick={send}>{t('chat_send')}</button>
          </div>
        </div>
      )}
    </>
  );
}
