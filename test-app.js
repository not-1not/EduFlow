import puppeteer from 'puppeteer';

(async () => {
    try {
        console.log('Starting puppeteer...');
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        page.on('console', msg => {
            console.log(`BROWSER-LOG: [${msg.type()}] ${msg.text()}`);
        });
        
        page.on('pageerror', error => {
            console.error('BROWSER-ERROR:', error.message);
        });

        console.log('Navigating to http://localhost:3000');
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
        
        console.log('Page loaded. Waiting 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
        
        const content = await page.content();
        if (content.includes('System_Data') || content.includes('LOADING')) {
            console.log('Still loading data...');
        } else {
            console.log('Data loaded successfully.');
        }
        
        await browser.close();
        console.log('Test finished.');
    } catch (e) {
        console.error('Script Error:', e);
    }
})();
