// Dates the South African way, the same on every screen: "20 Oct 2026", "20 Oct 2026, 18:28",
// and for recent things "2 hours ago" (in the app's language where the browser knows it).

const LANG_CODES = {
  English:'en', Afrikaans:'af', Zulu:'zu', Xhosa:'xh', Ndebele:'nr', Sepedi:'nso',
  Sesotho:'st', Setswana:'tn', Swati:'ss', Tshivenda:'ve', Xitsonga:'ts',
};

function toDate(value){
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value){
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' }) : '';
}

export function formatDateTime(value){
  const d = toDate(value);
  return d ? d.toLocaleString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }) : '';
}

// "just now", "5 minutes ago", "yesterday"... for the last week; the date and time after that
export function timeAgo(value, lang='English'){
  const d = toDate(value);
  if(!d) return '';
  const seconds = (d.getTime()-Date.now())/1000;
  if(-seconds > 7*24*3600 || seconds > 60) return formatDateTime(d);
  const code = LANG_CODES[lang] || 'en';
  const locale = Intl.RelativeTimeFormat.supportedLocalesOf([code]).length ? code : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric:'auto' });
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for(const [unit, size] of units){
    if(Math.abs(seconds) >= size) return rtf.format(Math.round(seconds/size), unit);
  }
  return rtf.format(0, 'second');
}
