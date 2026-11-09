// Browser-Tests der PWA: Ortsdaten kommen aus tests/fixtures/data (gebaut aus tests/fixtures/sample.osm),
// Kartenkacheln werden nachgebildet – die Tests brauchen kein Netz.
const {defineConfig}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'tests',
  timeout:30000,
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
  use:{
    baseURL:'http://localhost:8768',
    viewport:{width:390,height:844},
    locale:'de-DE',
    timezoneId:'Europe/Berlin',
    // Der Service Worker würde Anfragen an den Nachbildungen vorbei bedienen
    serviceWorkers:'block'
  },
  webServer:{command:'node tests/server.js',port:8768,reuseExistingServer:!process.env.CI}
});
