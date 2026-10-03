import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [canvas, webgl, css, html] = await Promise.all([
  readFile(new URL('../game-canvas.js', import.meta.url), 'utf8'),
  readFile(new URL('../game-webgl.js', import.meta.url), 'utf8'),
  readFile(new URL('../style.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
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
