import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesSource = await readFile(new URL('../match-rules.js', import.meta.url), 'utf8');
const { applyBallFlightDamping, ballFitsGoalMouth, formatGoalAnnouncement, GOAL_MOUTH_CENTER_HALF_WIDTH, GOAL_MOUTH_CENTER_MAX_HEIGHT } = await import(`data:text/javascript;base64,${Buffer.from(rulesSource).toString('base64')}`);

test('chỉ ghi bàn khi toàn bộ quả bóng lọt giữa cột và dưới xà', () => {
  assert.ok(ballFitsGoalMouth({ x: 0, h: 1 }));
  assert.ok(!ballFitsGoalMouth({ x: GOAL_MOUTH_CENTER_HALF_WIDTH, h: 1 }), 'bóng tiếp xúc mặt cột không được tính là lọt khung');
  assert.ok(!ballFitsGoalMouth({ x: 7.8, h: 1 }), 'bóng còn chồng lấn cột không được tính bàn');
  assert.ok(!ballFitsGoalMouth({ x: 0, h: GOAL_MOUTH_CENTER_MAX_HEIGHT }), 'bóng tiếp xúc mặt xà không được tính là lọt khung');
  assert.ok(!ballFitsGoalMouth({ x: 0, h: 3.8 }), 'bóng còn chồng lấn xà không được tính bàn');
});

test('damping bóng theo dt cho kết quả tương đương ở 30 Hz và 60 Hz', () => {
  const at60 = { vx: 12, vz: -23 };
  const at30 = { vx: 12, vz: -23 };
  for (let frame = 0; frame < 60; frame += 1) applyBallFlightDamping(at60, 1 / 60);
  for (let frame = 0; frame < 30; frame += 1) applyBallFlightDamping(at30, 1 / 30);
  assert.ok(Math.abs(at60.vx - at30.vx) < 1e-10);
  assert.ok(Math.abs(at60.vz - at30.vz) < 1e-10);
  assert.ok(at60.vx < 12 && at60.vz > -23, 'damping giảm nhẹ độ lớn vận tốc trên trục sân');
});

test('thông báo ghi bàn nêu tỉ số và số bàn còn lại để thắng', () => {
  assert.equal(formatGoalAnnouncement(1), 'Bàn thắng! Tỉ số 1–0. Còn 2 bàn để thắng.');
  assert.equal(formatGoalAnnouncement(3), 'Bàn thắng! Tỉ số 3–0. Còn 0 bàn để thắng.');
});

test('Canvas và WebGL cùng gọi luật cầu môn và damping dùng chung', async () => {
  const [canvas, webgl, html] = await Promise.all([
    readFile(new URL('../game-canvas.js', import.meta.url), 'utf8'),
    readFile(new URL('../game-webgl.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  for (const source of [canvas, webgl]) {
    assert.match(source, /ballFitsGoalMouth\(ball\)/);
    assert.match(source, /applyBallFlightDamping\(ball,\s*dt\)/);
    assert.match(source, /formatGoalAnnouncement\(game\.score\)/);
  }
  assert.match(html, /id="announcer"[^>]*aria-live="polite"/);
});
