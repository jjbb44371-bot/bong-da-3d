import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [canvas, webgl, css, html, modalFocus] = await Promise.all([
  readFile(new URL('../game-canvas.js', import.meta.url), 'utf8'),
  readFile(new URL('../game-webgl.js', import.meta.url), 'utf8'),
  readFile(new URL('../style.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../modal-focus.js', import.meta.url), 'utf8'),
]);

test('Canvas và WebGL chỉ sút khi nhả, còn cancel/lost capture/blur thì hủy charge', () => {
  for (const source of [canvas, webgl]) {
    assert.match(source, /addEventListener\('pointerup',releaseShot\)/);
    assert.match(source, /addEventListener\('pointercancel',cancelShot\)/);
    assert.match(source, /addEventListener\('lostpointercapture',cancelShot\)/);
    assert.match(source, /window\.addEventListener\('blur',[\s\S]*?cancelShotCharge\(\)/);
  }
});

test('nút cảm ứng hỗ trợ giữ bằng Enter/Space và viewport di động thấp có thể cuộn', () => {
  for (const source of [canvas, webgl]) {
    assert.match(source, /button\.addEventListener\('keydown',e=>\{if\(e\.code!==\'Enter\'&&e\.code!==\'Space\'/);
    assert.match(source, /button\.addEventListener\('keyup',e=>\{if\(e\.code!==\'Enter\'&&e\.code!==\'Space\'/);
  }
  assert.match(css, /@media\(max-width:760px\) and \(max-height:620px\)\{\.game-shell\{min-height:100dvh\}\.overlay\{overflow-y:auto/);
});

test('Space không chặn nút modal, chỉ nhả charge do bàn phím và Escape bỏ qua auto-repeat', () => {
  for (const source of [canvas, webgl]) {
    assert.match(source, /if\(e\.code==='Escape'\)\{e\.preventDefault\(\);if\(!e\.repeat\)togglePause\(\);return;\}/);
    assert.match(source, /e\.target instanceof Element&&e\.target\.closest\('button,\[role="button"\]'\)/);
    assert.match(source, /spaceKeyConsumed=true/);
    assert.match(source, /shouldFire=spaceConsumed&&keyboardShotPending/);
    assert.match(source, /if\(spaceConsumed\)\{e\.preventDefault\(\);if\(shouldFire\)fireShot\(\);\}/);
    assert.match(source, /(?:shoot|shootButton)\.addEventListener\('keydown',e=>\{if\(e\.code!=='Enter'&&e\.code!=='Space'/);
  }
});

test('vòng RAF không tự lặp liên tục khi không chơi và hết toast', () => {
  assert.match(canvas, /function scheduleFrame\(\)\{if\(frameScheduled\)return;frameScheduled=true;requestAnimationFrame\(frame\);\}/);
  assert.match(canvas, /if\(game\.active\|\|game\.toastTime>0\)scheduleFrame\(\)/);
  assert.match(webgl, /function scheduleFrame\(\)\{if\(frameScheduled\)return;frameScheduled=true;requestAnimationFrame\(animate\);\}/);
  assert.match(webgl, /if\(game\.active\|\|\(!game\.paused&&!game\.ended&&game\.toastTime>0\)\)scheduleFrame\(\)/);
});

test('khi bắt đầu trận, focus rời intro bị ẩn và chuyển tới vùng game', () => {
  assert.match(html, /<main id="game-shell" class="game-shell" tabindex="-1"/);
  for (const source of [canvas, webgl]) {
    assert.match(source, /function beginMatch\(\)\{[\s\S]*?\$\('game-shell'\)\.focus\(\{preventScroll:true\}\);/);
  }
});

test('intro mở như modal, focus được giữ bên trong và nền được trả lại khi bắt đầu trận', () => {
  assert.match(html, /<section class="overlay intro" id="intro"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="intro-title"/);
  for (const source of [canvas, webgl]) {
    assert.match(source, /openModal\(\$\('intro'\),\$\('start-button'\)\)/);
    assert.match(source, /function beginMatch\(\)\{[\s\S]*?closeModal\(\$\('intro'\)\)/);
  }
});

test('pause/result là dialog modal, giữ focus bên trong và vô hiệu hóa nền khi mở', () => {
  assert.match(html, /id="pause-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="result-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(modalFocus, /document\.addEventListener\('keydown',\s*trapFocus,\s*true\)/);
  assert.match(modalFocus, /element\.inert\s*=\s*true/);
  assert.match(modalFocus, /element\.inert\s*=\s*wasInert/);
  for (const source of [canvas, webgl]) {
    assert.match(source, /openModal\(\$\('pause-overlay'\),\$\('resume-button'\)\)/);
    assert.match(source, /openModal\(\$\('result-overlay'\),\$\('restart-button'\)\)/);
    assert.match(source, /closeModal\(\$\('pause-overlay'\),\$\('pause-button'\)\)/);
    assert.match(source, /closeModal\(\$\('result-overlay'\)\)/);
  }
});

test('Canvas và WebGL truyền snapshot hai đội từ cùng trạng thái đầu frame cho AI', () => {
  for (const source of [canvas, webgl]) {
    assert.match(source, /const homeBefore=homeRoster\.map\(\(agent\)=>\(\{\.\.\.agent\}\)\),awayBefore=(?:defenders|defenderStates)\.map\(\(agent\)=>\(\{\.\.\.agent\}\)\)/);
    assert.match(source, /opponents:awayBefore/);
    assert.match(source, /opponents:homeBefore/);
  }
});

test('WebGL cập nhật pixel ratio có giới hạn khi kích thước/DPR thay đổi', () => {
  const resize = webgl.match(/function resize\(\)\{([^}]+)\}/)?.[1] ?? '';
  assert.match(resize, /Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*1\.65\)/);
  assert.match(resize, /renderer\.getPixelRatio\(\)\s*!==\s*pixelRatio/);
  assert.match(resize, /renderer\.setPixelRatio\(pixelRatio\)/);
});
