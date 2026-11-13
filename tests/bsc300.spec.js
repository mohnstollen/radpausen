const {test,expect}=require('@playwright/test');
const path=require('path'),fs=require('fs'),os=require('os');

// Erwartete Bytes stammen aus einem Mitschnitt der Hersteller-App (siehe docs/bsc300-protokoll.md)
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const GPX=wpt=>`<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">${wpt}<trk><name>Testrunde</name><trkseg>
<trkpt lat="50.000000" lon="10.000000"><ele>300</ele></trkpt>
<trkpt lat="50.000100" lon="9.999980"><ele>300.25</ele></trkpt>
<trkpt lat="50.000150" lon="9.999990"><ele>300.25</ele></trkpt>
</trkseg></trk></gpx>`;
function gpxFile(name,wpt=''){
  const f=path.join(os.tmpdir(),`rp-${process.pid}-${name}.gpx`);fs.writeFileSync(f,GPX(wpt));return f;
}

test('BSC300: Kopf, Prüfsumme und Nachricht entsprechen dem Mitschnitt',async({page})=>{
  await page.goto('/bsc300.html');
  const r=await page.evaluate(()=>{
    const h=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
    const msg=buildRouteMessage({id:5,name:'A',fileBytes:new Uint8Array([1,2,3]),distM:10,ascM:2});
    return {ping:h(buildCommand(13,1)),fw:h(buildCommand(4,1)),msg:h(msg),
      ok:parseReply(Uint8Array.from('0215ffff03ffff00ffffffffffffffffffffff55'.match(/../g),x=>parseInt(x,16))),
      lang:new TextDecoder().decode(truncateUtf8('ä'.repeat(40),50)).length};
  });
  expect(r.ping).toBe('010dffff01ffff0004be01ffffffffffffffffec080d1001');
  expect(r.fw).toBe('0104ffff01ffff00043001ffffffffffffffff5708041001');
  // Kopf wie im Mitschnitt, dann Länge, Protobuf (Felder 1–7, 10, 11) und die Datei
  expect(r.msg).toBe('0115ffaa03ffff00000001ffffffffffffffff57'+'0000001e'
    +'0815'+'1003'+'1802'+'2003'+'2805'+'320141'+'3a03636e78'+'5000'+'5a08'+'08e807'+'10c801'+'1800'+'010203');
  expect(r.ok).toEqual({ok:true,status:0});
  expect(r.lang).toBe(25); // 50 Bytes, kein halbes Zeichen
});

test('BSC300: GPX wird zur CNX-Datei mit Differenzen',async({page})=>{
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto('/bsc300.html');
  await page.setInputFiles('#file',gpxFile('ohne'));
  await expect(page.locator('#name')).toHaveValue('Testrunde');
  await expect(page.locator('#i-pts')).toHaveText('3');
  await expect(page.locator('#send')).toBeEnabled();
  await expect(page.locator('#wptrow')).toBeHidden();
  const cnx=await page.evaluate(()=>new TextDecoder().decode(route.cnx));
  // Punkt 0 absolut, Punkt 1 Differenz, Punkt 2 zweite Differenz (je 1e-7 Grad), Höhe in cm
  expect(cnx).toContain('<TracksCount>3</TracksCount>\n<Tracks>50.000000,10.000000,30000;1000,-200,25;-500,300,0;</Tracks>');
  expect(cnx).toContain('<Encode>2</Encode>');
  expect(cnx).toContain('<PointCount>0</PointCount>\n<Points />');
  expect(errs).toEqual([]);
});

test('BSC300: Wegpunkte kommen nur auf Wunsch in die Datei',async({page})=>{
  await page.goto('/bsc300.html');
  await page.setInputFiles('#file',gpxFile('mit','<wpt lat="50.0001" lon="10.0002"><name>Bäcker &amp; Café</name></wpt>'));
  await expect(page.locator('#wptlabel')).toContainText('1 Wegpunkte');
  expect(await page.evaluate(()=>new TextDecoder().decode(route.cnx))).toContain('<Points />');
  await page.check('#wpts');
  expect(await page.evaluate(()=>new TextDecoder().decode(route.cnx))).toContain(
    '<PointCount>1</PointCount>\n<Points><Point><Lat>50.000100</Lat><Lng>10.000200</Lng><Descr>Bäcker &amp; Café</Descr></Point></Points>');
});

test('BSC300: ohne Web Bluetooth gibt es einen Hinweis statt eines Fehlers',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true})});
  await page.goto('/bsc300.html');
  await page.setInputFiles('#file',gpxFile('hinweis'));
  await page.click('#send');
  await expect(page.locator('#status')).toContainText('Web Bluetooth');
});
