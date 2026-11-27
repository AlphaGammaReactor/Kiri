// Draws the app icon (src-tauri/app-icon.png): the Newsreader K centred by its ink box in the green square.
// Then: npx tauri icon src-tauri/app-icon.png -o src-tauri/icons  (and delete the android/ and ios/ folders it adds)
const { chromium } = require('playwright');
const fs = require('fs');
const weight = process.argv[2] || '500';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(`<style>@font-face{font-family:N;src:url(data:font/woff2;base64,${fs.readFileSync(require.resolve(`@fontsource/newsreader/files/newsreader-latin-${weight}-normal.woff2`)).toString('base64')})}</style><canvas id=c width=1024 height=1024></canvas>`);
  const data = await p.evaluate(async (weight) => {
    await document.fonts.load(`${weight} 100px N`);
    const c = document.getElementById('c'), x = c.getContext('2d');
    const S = 100, E = 922, R = 185;
    const rr = (o) => { x.beginPath(); x.roundRect(S, S + o, E - S, E - S, R); };
    // soft drop edge like the old icon, then the square
    x.fillStyle = 'rgba(0,0,0,0.18)'; rr(4); x.fill();
    x.fillStyle = '#285d42'; rr(2); x.fill();
    x.fillStyle = '#2e6a4c'; rr(0); x.fill();
    x.font = `${weight} 650px N`; x.fillStyle = '#fefcf6';
    const m = x.measureText('K');
    // centre the glyph's ink box (not its advance or baseline) in the square
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const cx = (S + E) / 2, cy = (S + E) / 2;
    const ox = cx - w / 2 + m.actualBoundingBoxLeft, oy = cy - h / 2 + m.actualBoundingBoxAscent;
    x.fillText('K', ox, oy);
    return c.toDataURL('image/png');
  }, weight);
  fs.writeFileSync(require('path').join(__dirname, '../src-tauri/app-icon.png'), Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
