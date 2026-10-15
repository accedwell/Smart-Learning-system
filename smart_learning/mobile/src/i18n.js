// The app's text in South Africa's 11 official languages, from the web app's translation files
// (frontend/src/i18n). A string missing from a translation shows in English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UI } from '../../frontend/src/i18n/strings.js';
import af from '../../frontend/src/i18n/translations/af.js';
import zu from '../../frontend/src/i18n/translations/zu.js';
import xh from '../../frontend/src/i18n/translations/xh.js';
import nr from '../../frontend/src/i18n/translations/nr.js';
import nso from '../../frontend/src/i18n/translations/nso.js';
import st from '../../frontend/src/i18n/translations/st.js';
import tn from '../../frontend/src/i18n/translations/tn.js';
import ss from '../../frontend/src/i18n/translations/ss.js';
import ve from '../../frontend/src/i18n/translations/ve.js';
import ts from '../../frontend/src/i18n/translations/ts.js';
import { getItem, setItem } from './storage';

const TRANSLATIONS = {
  Afrikaans: af, Zulu: zu, Xhosa: xh, Ndebele: nr, Sepedi: nso,
  Sesotho: st, Setswana: tn, Swati: ss, Tshivenda: ve, Xitsonga: ts,
};

// the value is what the backend expects (e.g. for the chat's reply language)
export const LANGUAGES = [
  ['English', 'English'], ['Afrikaans', 'Afrikaans'], ['Zulu', 'isiZulu'], ['Xhosa', 'isiXhosa'],
  ['Ndebele', 'isiNdebele'], ['Sepedi', 'Sepedi'], ['Sesotho', 'Sesotho'], ['Setswana', 'Setswana'],
  ['Swati', 'siSwati'], ['Tshivenda', 'Tshivenda'], ['Xitsonga', 'Xitsonga'],
];

const STORAGE_KEY = 'smart-learning-language';
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('English');

  useEffect(() => {
    getItem(STORAGE_KEY).then((saved) => {
      if (saved && (saved === 'English' || TRANSLATIONS[saved])) setLang(saved);
    });
  }, []);

  const t = useCallback((key, vars) => {
    let text = lang !== 'English' ? TRANSLATIONS[lang][key] : null;
    if (text == null) text = UI[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
    }
    return text;
  }, [lang]);

  const setLanguage = useCallback((next) => {
    setLang(next);
    setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ t, lang, setLanguage, has: (key) => key in UI }), [t, lang, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
