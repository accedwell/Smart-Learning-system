// Saves a plain-text report. Uses the artifact runtime's downloads capability
// when present (as the prototype did), otherwise a normal browser download.
export async function saveTextFile(filename, text){
  try{
    const downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if(downloads){ await downloads.save({ filename, data:text }); return; }
  } catch{ /* fall through to a browser download */ }
  const url = URL.createObjectURL(new Blob([text], { type:'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
