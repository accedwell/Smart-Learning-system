// Opens or downloads an uploaded paper. The file needs the sign-in token, which a plain link
// can't send, so it is fetched first and handed to the browser as a local blob URL.
// Resolves to an error ({ code }) or null.
export async function openFile(url, token, { download=false, fileName='file' } = {}){
  // a new tab has to be opened while the click still counts, or the browser blocks it
  const win = download ? null : window.open('', '_blank');
  try{
    const res = await fetch(url, { headers:{ Authorization:'Bearer '+token } });
    if(!res.ok) throw new Error(String(res.status));
    const blobUrl = URL.createObjectURL(await res.blob());
    if(download){
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
    } else if(win){
      win.location.href = blobUrl;
    } else {
      window.location.href = blobUrl;
    }
    setTimeout(()=>URL.revokeObjectURL(blobUrl), 60000);
    return null;
  } catch{
    if(win) win.close();
    return { code:'api_error_server' };
  }
}
