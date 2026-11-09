// Minimaler statischer Server für die Tests; /data/ zeigt auf die Testdaten
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),data=path.join(__dirname,'fixtures','data');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.gpx':'application/gpx+xml'};
http.createServer((req,res)=>{
  let p=path.normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)).replace(/^[/\\]+/,'')||'index.html';
  let base=root;
  if(p.startsWith('data'+path.sep)){base=data;p=p.slice(5)}
  const f=path.join(base,p);
  if(!f.startsWith(base+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(f,(err,buf)=>{
    if(err){res.writeHead(404);return res.end()}
    res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(buf);
  });
}).listen(8768);
