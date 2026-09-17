const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[TIMELINE:')) {
      logs.push(text);
      console.log(text);
    }
  });

  // Create a new match via API to get a fresh room code
  const res = await fetch('http://localhost:3001/api/match/create', { method: 'POST', body: JSON.stringify({ hostPlayerId: 'p1' }) });
  const data = await res.json();
  const room = data.inviteCode;

  // Join the room
  await page.goto(`http://localhost:3001/game/${room}`);
  
  // Wait for loading to finish
  await page.waitForTimeout(2000);
  
  // Start game by clicking start button (simulate API call instead to be faster)
  await fetch('http://localhost:3001/api/game/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: data.matchId }) });
  
  await page.reload();
  await page.waitForTimeout(2000);
  
  // Roll dice
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Roll'));
    if(btn) btn.click();
  });
  
  await page.waitForTimeout(2000);
  
  // Buy
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Buy $200'));
    if(btn) btn.click();
  });
  
  await page.waitForTimeout(2000);

  console.log("Captured Logs:", logs.length);
  await browser.close();
})();
