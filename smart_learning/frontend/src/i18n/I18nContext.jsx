import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { UI } from './strings.js'
import { getSampler } from '../services/ai.js'

const I18nContext = createContext(null);

export function I18nProvider({ children }){
  const [lang, setLang] = useState('English');
  const [translations, setTranslations] = useState({}); // lang -> {key: text}
  const [translating, setTranslating] = useState(false);

  const t = useCallback((key, vars)=>{
    let text;
    if(lang!=='English'){
      const map = translations[lang];
      text = map && map[key];
    }
    if(text==null) text = UI[key] || key;
    if(vars){
      Object.entries(vars).forEach(([k,v])=>{ text = text.replace(new RegExp('\\{'+k+'\\}','g'), v); });
    }
    return text;
  }, [lang, translations]);

  // switches the whole app's language; non-English strings are machine
  // translated once and cached (falls back to English when AI is unavailable)
  const setLanguage = useCallback(async (next)=>{
    setLang(next);
    if(next==='English' || translations[next]) return;
    setTranslating(true);
    const map = {};
    try{
      const sample = await getSampler();
      if(sample){
        const items = Object.keys(UI).map(k=>({ key:k, text:UI[k] }));
        const prompt = 'Translate the "text" field of every item below into '+next+' (a South African language). '+
          'Return ONLY a JSON array, same length and order, each item {"key": same key, "text": translated text}. '+
          'Keep any {placeholder} tokens (like {n}, {teacher}, {pct}) unchanged and in the same relative position. '+
          'Keep it natural and concise, matching a simple app UI tone.\n\n'+JSON.stringify(items);
        const res = await sample.json(prompt, { modelTier:'default' });
        const arr = Array.isArray(res) ? res : (res && res.items) || [];
        arr.forEach(it=>{ if(it && it.key) map[it.key] = it.text; });
      }
    } catch{ /* keep the empty map: English fallback */ }
    setTranslations(prev=>({ ...prev, [next]:map }));
    setTranslating(false);
  }, [translations]);

  const value = useMemo(()=>({ lang, t, setLanguage, translating }), [lang, t, setLanguage, translating]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
  return useContext(I18nContext);
}
