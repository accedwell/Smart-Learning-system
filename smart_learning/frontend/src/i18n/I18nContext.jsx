import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { UI } from './strings.js'

const I18nContext = createContext(null);

// The translations of UI (strings.js), one file per language in ./translations, loaded the
// first time someone picks that language. A string missing from a translation shows in English.
const LOADERS = {
  Afrikaans: ()=>import('./translations/af.js'),
  Zulu: ()=>import('./translations/zu.js'),
  Xhosa: ()=>import('./translations/xh.js'),
  Ndebele: ()=>import('./translations/nr.js'),
  Sepedi: ()=>import('./translations/nso.js'),
  Sesotho: ()=>import('./translations/st.js'),
  Setswana: ()=>import('./translations/tn.js'),
  Swati: ()=>import('./translations/ss.js'),
  Tshivenda: ()=>import('./translations/ve.js'),
  Xitsonga: ()=>import('./translations/ts.js'),
};
// for <html lang>, so screen readers and the browser know the page's language
const HTML_LANG = { English:'en', Afrikaans:'af', Zulu:'zu', Xhosa:'xh', Ndebele:'nr', Sepedi:'nso', Sesotho:'st', Setswana:'tn', Swati:'ss', Tshivenda:'ve', Xitsonga:'ts' };
const STORAGE_KEY = 'smart-learning-language';

function savedLanguage(){
  try{
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (v==='English' || LOADERS[v]) ? v : 'English';
  } catch{
    return 'English';
  }
}

export function I18nProvider({ children }){
  const [lang, setLang] = useState(savedLanguage);
  const [translations, setTranslations] = useState({}); // lang -> {key: text}
  // while the chosen language's file is still on its way
  const translating = lang!=='English' && Boolean(LOADERS[lang]) && !translations[lang];

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

  // switches the whole app's language, and remembers it for next time on this browser
  const setLanguage = useCallback((next)=>{
    setLang(next);
    try{ localStorage.setItem(STORAGE_KEY, next); } catch{ /* private window: not remembered */ }
  }, []);

  // loads the chosen language's translation file once; if it can't load, that language shows in English
  useEffect(()=>{
    if(lang==='English' || translations[lang] || !LOADERS[lang]) return;
    let cancelled = false;
    LOADERS[lang]().then((mod)=>mod.default, ()=>({})).then((map)=>{
      if(!cancelled) setTranslations(prev=>({ ...prev, [lang]:map }));
    });
    return ()=>{ cancelled = true; };
  }, [lang, translations]);

  useEffect(()=>{
    document.documentElement.lang = HTML_LANG[lang] || 'en';
  }, [lang]);

  const value = useMemo(()=>({ lang, t, setLanguage, translating }), [lang, t, setLanguage, translating]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
  return useContext(I18nContext);
}
