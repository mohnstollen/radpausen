const {test,expect}=require('@playwright/test');
const path=require('path'),fs=require('fs');
const FX=p=>path.join(__dirname,'fixtures',p);

// Montag, 9.11.2026, 8:00 – Abfahrt wird auf die nächste Viertelstunde gesetzt (8:15)
async function start(page,o={}){
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.clock.install({time:new Date(o.time||'2026-11-09T08:00:00+01:00')});
  await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({path:FX('tile.png'),headers:{'access-control-allow-origin':'*'}}));
  await page.addInitScript(()=>{window.RP_NO_SW=true});
  await page.goto('/');
  return errs;
}
const open=(page,f='kurz.gpx')=>page.setInputFiles('#file',FX(f));
const rows=page=>page.locator('#pois li[data-i]');
const row=(page,name)=>rows(page).filter({hasText:name});

test('GPX öffnen zeigt die Orte entlang der Strecke mit Kilometer, Seite und Öffnungszeit',async({page})=>{
  const errs=await start(page);
  await expect(page.locator('#empty')).toBeVisible();
  await open(page);
  await expect(page.locator('#title')).toHaveText('Testrunde');
  await expect(rows(page)).toHaveCount(11);
  // Reihenfolge nach Kilometer; zu weit entfernte Orte, Bushaltestelle und „kein Trinkwasser“ fehlen
  const names=await rows(page).locator('b').allTextContents();
  expect(names).toEqual(['Bäckerei Am Anger','Testmarkt','Döner Eck','Trinkwasser','Friedhof Testdorf','Reparaturstation','Radl Huber','Schutzhütte','Picknickplatz','Dorfladen Kleinberg','Marktbrunnen']);
  await expect(page.locator('#pois')).not.toContainText('Zu weit weg');
  await expect(page.locator('#pois')).not.toContainText('Bank');
  const bk=row(page,'Bäckerei Am Anger');
  await expect(bk.locator('.km')).toHaveText('0,7');
  await expect(bk).toContainText('100 m links');
  await expect(bk).toContainText('an 08:17');
  await expect(bk.locator('.open')).toHaveText('offen bis 12:00');
  await expect(row(page,'Radl Huber').locator('.closed')).toHaveText('zu · öffnet Di 09:00');
  await expect(row(page,'Döner Eck')).toContainText('rechts');
  await expect(row(page,'Friedhof Testdorf')).toContainText('meist mit Wasserhahn');
  await expect(row(page,'Reparaturstation')).toContainText('Pumpe, Werkzeug');
  await expect(page.locator('#sum')).toContainText('7,2 km');
  await expect(page.locator('#dataver')).toHaveText('Datenstand 1.11.2026');
  expect(errs).toEqual([]);
});

test('Ankunft nach Ladenschluss: Bäcker als geschlossen markiert',async({page})=>{
  await start(page,{time:'2026-11-09T11:50:00+01:00'});
  await open(page);
  await expect(row(page,'Bäckerei Am Anger').locator('.closed')).toHaveText('zu · öffnet Di 06:00');
  await expect(row(page,'Testmarkt').locator('.open')).toHaveText('offen bis 20:00');
});

test('Abstand zur Strecke und Kategorien lassen sich einstellen',async({page})=>{
  await start(page);
  await open(page);
  await expect(rows(page)).toHaveCount(11);
  // Bänke sind standardmäßig aus und lassen sich über den Chip einblenden
  await page.locator('.chip[data-c=be]').click();
  await expect(row(page,'Bank')).toContainText('mit Lehne');
  await expect(rows(page)).toHaveCount(12);
  await page.locator('.chip[data-c=be]').click();
  // Korridor 250 m: Supermarkt (300 m) und Friedhof (Mitte 254 m neben der Strecke) fallen raus
  await page.click('#opts');
  await page.locator('#corr').fill('250');
  await page.locator('#corr').dispatchEvent('change');
  await page.click('#dlg .primary');
  await expect(rows(page)).toHaveCount(9);
  await expect(page.locator('#pois')).not.toContainText('Testmarkt');
  await expect(page.locator('#pois')).not.toContainText('Friedhof');
  // Fast Food in den Einstellungen abwählen
  await page.click('#opts');
  await page.locator('#catbox input[data-c=ff]').uncheck();
  await page.click('#dlg .primary');
  await expect(page.locator('#pois')).not.toContainText('Döner Eck');
});

test('Warnung bei langen Abschnitten ohne Essen oder Wasser',async({page})=>{
  await start(page);
  await open(page,'lang.gpx');
  await expect(page.locator('#sum .gap')).toHaveText(['⚠️ km 5,8–36,1: kein Essen (30,3 km)','⚠️ km 6,5–36,1: kein Wasser (29,6 km)']);
});

test('Tour und Ortsdaten bleiben gespeichert und funktionieren ohne Netz',async({page})=>{
  await start(page);
  await open(page);
  await expect(rows(page)).toHaveCount(11);
  await page.route('**/data/**',r=>r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#title')).toHaveText('Testrunde');
  await expect(rows(page)).toHaveCount(11);
  await expect(page.locator('#status')).toBeEmpty();
  // Gespeicherte Tour löschen
  await page.click('#opts');
  await expect(page.locator('#tours li')).toHaveCount(1);
  await page.locator('#tours .del-t').click();
  await page.click('#dlg .primary');
  await expect(page.locator('#empty')).toBeVisible();
});

test('Karte zeigt Strecke und Orte, Antippen in der Liste öffnet den Ort auf der Karte',async({page})=>{
  await start(page);
  await open(page);
  await row(page,'Döner Eck').click();
  await expect(page.locator('.leaflet-popup-content')).toContainText('Döner Eck');
  await expect(page.locator('.leaflet-popup-content')).toContainText('Mo-Su 11:00-22:00');
  await expect(page.locator('.mk')).toHaveCount(11);
  await expect(page.locator('.mk.cl')).toHaveCount(2); // Döner (öffnet 11:00) und Radladen (Montag zu)
});

test('Export: GPX mit Strecke und den angezeigten Orten als Wegpunkte',async({page})=>{
  await start(page);
  await open(page);
  await expect(rows(page)).toHaveCount(11);
  await page.click('#opts');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#export')]);
  expect(dl.suggestedFilename()).toBe('Testrunde - Radpausen.gpx');
  const gpx=fs.readFileSync(await dl.path(),'utf8');
  expect(gpx.match(/<wpt /g)).toHaveLength(11);
  expect(gpx).toContain('<name>Bäckerei Am Anger</name>');
  expect(gpx.match(/<trkpt /g).length).toBeGreaterThan(50);
});

test('Ungültige Datei: verständliche Meldung',async({page})=>{
  await start(page);
  const msg=new Promise(res=>page.once('dialog',d=>{res(d.message());d.dismiss()}));
  await page.setInputFiles('#file',{name:'kaputt.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx><trk></trk></gpx>')});
  expect(await msg).toContain('keine Strecke');
});
