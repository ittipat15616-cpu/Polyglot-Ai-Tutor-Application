const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('LOG:', msg.text()));
    
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    
    // wait a bit for react to render
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    console.log("HTML length:", html.length);
    console.log("Has root content?", html.includes('id="root"') && html.length > 500);
    
    // Check if my error overlay is visible
    const errorMsg = await page.evaluate(() => {
      const el = document.getElementById('error-msg');
      return el && el.parentElement.style.display !== 'none' ? el.textContent : null;
    });
    
    if (errorMsg) {
      console.log("ERROR OVERLAY:", errorMsg);
    } else {
      console.log("No error overlay");
      console.log("Body text:", await page.evaluate(() => document.body.innerText.substring(0, 500)));
    }
    
    await browser.close();
  } catch(e) {
    console.log(e.message);
  }
})();
