// Service Worker: App offline verfügbar machen, angesehene Kartenkacheln merken, „Teilen → Radpausen“ annehmen.
// Die Ortsdaten (data/) speichert die Seite selbst im Cache „rp-data“.
const C='rp-shell-v1',TILES='rp-tiles',MAX_TILES=3000;
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png',
  'vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/opening_hours.min.js'];

self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys()
  .then(k=>Promise.all(k.filter(x=>x.startsWith('rp-shell-')&&x!==C).map(x=>caches.delete(x)))).then(()=>clients.claim())));

// Kacheln, die man sich angesehen hat, bleiben für unterwegs im Cache (kein Massen-Download, siehe
// https://operations.osmfoundation.org/policies/tiles/). Älteste fliegen raus, wenn es zu viele werden.
let trimming=null;
async function trimTiles(){
  const c=await caches.open(TILES),k=await c.keys();
  for(const r of k.slice(0,Math.max(0,k.length-MAX_TILES)))await c.delete(r);
}

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  // Geteilte GPX-Datei (Web Share Target, siehe manifest.webmanifest)
  if(e.request.method==='POST'&&u.origin===location.origin&&u.pathname.endsWith('/share')){
    e.respondWith((async()=>{
      try{
        const f=(await e.request.formData()).get('gpx');
        if(f&&f.size)await (await caches.open('rp-share')).put('shared-gpx',new Response(f,{headers:{'x-name':encodeURIComponent(f.name||'')}}));
      }catch{}
      return Response.redirect(new URL('./?shared=1',self.registration.scope).href,303);
    })());
    return;
  }
  if(e.request.method!=='GET')return;
  if(u.host==='tile.openstreetmap.org'){
    e.respondWith(caches.open(TILES).then(async c=>{
      const hit=await c.match(e.request);
      const net=fetch(e.request).then(r=>{if(r.ok){c.put(e.request,r.clone());trimming=trimming||trimTiles().finally(()=>trimming=null)}return r});
      return hit?(net.catch(()=>hit),hit):net;
    }));
    return;
  }
  // App selbst: aus dem Cache, im Hintergrund aktualisieren. data/ übernimmt die Seite.
  if(u.origin!==location.origin||u.pathname.includes('/data/'))return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp))}return r}).catch(()=>hit);
    return hit||net;
  }));
});
