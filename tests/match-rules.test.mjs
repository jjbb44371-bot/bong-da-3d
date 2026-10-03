import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesSource = await readFile(new URL('../match-rules.js', import.meta.url), 'utf8');
const { applyBallFlightDamping, ballFitsGoalMouth, formatGoalAnnouncement, goalPlaneCrossing, keeperReboundVelocity, AWAY_GOAL_LINE_Z, AWAY_GOAL_SCORE_PLANE_Z, BALL_RADIUS, GOAL_MOUTH_CENTER_HALF_WIDTH, GOAL_MOUTH_CENTER_MAX_HEIGHT } = await import(`data:text/javascript;base64,${Buffer.from(rulesSource).toString('base64')}`);

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

test('goal mouth được xét tại thời điểm bóng cắt vạch, không xét endpoint của bước mô phỏng', () => {
  assert.equal(AWAY_GOAL_SCORE_PLANE_Z, AWAY_GOAL_LINE_Z - BALL_RADIUS, 'tâm bóng phải đi quá vạch vật lý ít nhất một bán kính');
  const endpointInside = { x: 7.564, z: -55.76, h: 0.59 };
  const crossingOutside = goalPlaneCrossing({ x: 8.02, z: -54, h: 0.59 }, endpointInside, AWAY_GOAL_SCORE_PLANE_Z);
  assert.ok(crossingOutside);
  assert.ok(ballFitsGoalMouth(endpointInside), 'endpoint nằm trong ngưỡng khung thành');
  assert.ok(!ballFitsGoalMouth(crossingOutside), 'tại vạch, bóng vẫn chạm cột nên không phải bàn');
  assert.equal(crossingOutside.z, AWAY_GOAL_SCORE_PLANE_Z);

  const endpointOutside = { x: 7.65, z: -55.8, h: 0.59 };
  const crossingInside = goalPlaneCrossing({ x: 7, z: -54.4, h: 0.59 }, endpointOutside, AWAY_GOAL_SCORE_PLANE_Z);
  assert.ok(crossingInside);
  assert.ok(!ballFitsGoalMouth(endpointOutside), 'endpoint đã lệch khỏi khung');
  assert.ok(ballFitsGoalMouth(crossingInside), 'bóng đã qua trọn vẹn khung tại mặt phẳng vượt vạch');
  assert.equal(goalPlaneCrossing({ x: 0, z: AWAY_GOAL_SCORE_PLANE_Z + 0.1, h: 1 }, { x: 0, z: AWAY_GOAL_SCORE_PLANE_Z + 0.01, h: 1 }, AWAY_GOAL_SCORE_PLANE_Z), null, 'đoạn chưa vượt mặt phẳng ghi bàn không tạo crossing');
  assert.equal(goalPlaneCrossing({ x: 0, z: AWAY_GOAL_SCORE_PLANE_Z + 0.1, h: 1 }, { x: 0, z: AWAY_GOAL_SCORE_PLANE_Z, h: 1 }, AWAY_GOAL_SCORE_PLANE_Z), null, 'bóng vừa chạm mặt phẳng nhưng chưa vượt hết thì chưa ghi bàn');
  assert.ok(Math.abs(goalPlaneCrossing({ x: 0, z: AWAY_GOAL_SCORE_PLANE_Z, h: 1 }, { x: 0, z: AWAY_GOAL_SCORE_PLANE_Z - 0.01, h: 1 }, AWAY_GOAL_SCORE_PLANE_Z)?.fraction ?? 1) < 1e-12, 'bước kế tiếp ghi nhận bóng vừa đi qua mặt phẳng');
});

test('bóng bật khỏi thủ môn quay ra sân thay vì tiếp tục xuyên vào lưới', async () => {
  assert.equal(keeperReboundVelocity(-25), 4);
  assert.equal(keeperReboundVelocity(-6), 2.2, 'rebound giữ vận tốc tối thiểu đã cân chỉnh');
  let z = -53.4;
  const vz = keeperReboundVelocity(-25);
  for (let frame = 0; frame < 30; frame += 1) z += vz / 60;
  assert.ok(z > -53.4 && z > AWAY_GOAL_LINE_Z, 'quỹ đạo sau cú cứu thua đi xa khỏi khung thành');
  const [canvas, webgl] = await Promise.all([
    readFile(new URL('../game-canvas.js', import.meta.url), 'utf8'),
    readFile(new URL('../game-webgl.js', import.meta.url), 'utf8'),
  ]);
  for (const source of [canvas, webgl]) assert.match(source, /ball\.vz=keeperReboundVelocity\(ball\.vz\)/);
});

test('Canvas và WebGL cùng gọi luật cầu môn và damping dùng chung', async () => {
  const [canvas, webgl, html] = await Promise.all([
    readFile(new URL('../game-canvas.js', import.meta.url), 'utf8'),
    readFile(new URL('../game-webgl.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  for (const source of [canvas, webgl]) {
    assert.match(source, /goalPlaneCrossing\(previousBall,\s*ball,\s*AWAY_GOAL_SCORE_PLANE_Z\)/);
    assert.match(source, /ballFitsGoalMouth\(crossing\)/);
    assert.match(source, /resolveKeeperSave\(crossing\)/);
    assert.match(source, /applyBallFlightDamping\(ball,\s*dt\)/);
    assert.match(source, /formatGoalAnnouncement\(game\.score\)/);
  }
  assert.match(html, /id="announcer"[^>]*aria-live="polite"/);
});
