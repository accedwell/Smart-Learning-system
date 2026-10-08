// Bridge to the AI runtime. The prototype ran inside a Claude artifact, where
// `window.claude.use('sample')` gave it a model to call. Outside that runtime
// these helpers resolve to null and every AI feature is skipped quietly, the
// same way the prototype degrades. Point them at the backend API once it exists.

async function getCapability(name){
  try{
    if(typeof window!=='undefined' && window.claude && window.claude.use){
      return await window.claude.use(name);
    }
  } catch{ /* capability not granted */ }
  return null;
}

export function getSampler(){
  return getCapability('sample');
}

// asks for ONE short sentence; resolves to the trimmed text, or null when AI is unavailable
export async function askOneLiner(prompt){
  try{
    const sample = await getSampler();
    if(!sample) return null;
    const res = await sample(prompt, { modelTier:'quick' });
    return res.text.trim();
  } catch{
    return null;
  }
}

export function langNote(lang){
  return lang==='English' ? '' : ` Reply in ${lang}.`;
}
