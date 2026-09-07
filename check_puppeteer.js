const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });
    
    await browser.close();
    console.log("Puppeteer finished");
  } catch (e) {
    console.log("Error:", e.message);
  }
})();
