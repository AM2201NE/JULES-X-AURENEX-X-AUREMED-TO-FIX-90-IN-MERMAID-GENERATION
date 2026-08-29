const { chromium } = require('playwright');

(async () => {
  console.log('Starting Playwright test...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  console.log('Page loaded');
  await page.waitForTimeout(3000);
  
  const bodyText = await page.textContent('body');
  console.log('Page body length:', bodyText.length);
  console.log('Page body preview:', bodyText.substring(0, 200));
  
  await browser.close();
})();
