(() => {
  const copy = {
    en: {eyebrow:'A MOMENT OFFLINE',title:'Your flow will be back.',description:'Connect to the internet to open your workspace. Projects, time entries and invoices are available online; changes are not queued offline.',retry:'Try again',language:'Language',connected:'A connection may be available. Try again.',offline:'You are offline.'},
    de: {eyebrow:'KURZ OFFLINE',title:'Gleich wieder im Flow.',description:'Verbinde dich mit dem Internet, um deinen Workspace zu öffnen. Projekte, Zeiten und Rechnungen sind online verfügbar; Änderungen werden offline nicht vorgemerkt.',retry:'Erneut versuchen',language:'Sprache',connected:'Eine Verbindung ist möglicherweise verfügbar. Versuche es erneut.',offline:'Du bist offline.'},
    zh: {eyebrow:'暂时离线',title:'稍后继续，保持节奏。',description:'连接互联网后即可打开工作区。项目、工时和发票需要联网使用；离线更改不会排队同步。',retry:'重试',language:'语言',connected:'网络可能已恢复，请重试。',offline:'当前处于离线状态。'}
  };
  let preference;try { preference=localStorage.getItem('vave-log.locale'); } catch {}
  const system=(navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  let language=copy[preference]?preference:system.startsWith('de')?'de':system.startsWith('zh')?'zh':'en';
  const select=document.getElementById('language');
  function render(){const c=copy[language];document.documentElement.lang=language;for(const id of ['eyebrow','title','description','retry'])document.getElementById(id).textContent=c[id];document.getElementById('language-label').textContent=c.language;select.value=language;document.getElementById('connection').textContent=navigator.onLine?c.connected:c.offline;}
  select.addEventListener('change',()=>{language=select.value;try{localStorage.setItem('vave-log.locale',language);}catch{}render();});
  document.getElementById('retry').addEventListener('click',()=>{if(location.pathname==='/offline.html')location.assign('/');else location.reload();});
  window.addEventListener('online',render);window.addEventListener('offline',render);render();
})();
