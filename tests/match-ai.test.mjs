import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../match-ai.js', import.meta.url), 'utf8');
const {
  CONTROLLED_SLOT,
  FIELD_PLAYERS_PER_TEAM,
  PLAYERS_PER_TEAM,
  createOutfieldRoster,
  resetOutfieldRoster,
  updateTeamAI,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('mỗi roster có 10 cầu thủ sân, tương đương 11 người khi cộng thủ môn', () => {
  const home = createOutfieldRoster('home');
  const away = createOutfieldRoster('away');
  assert.equal(FIELD_PLAYERS_PER_TEAM, 10);
  assert.equal(PLAYERS_PER_TEAM, 11);
  assert.equal(home.length + 1, PLAYERS_PER_TEAM);
  assert.equal(away.length + 1, PLAYERS_PER_TEAM);
  assert.equal(home[CONTROLLED_SLOT].role, 'CAM');
  assert.equal(new Set(home.map((p) => p.id)).size, 10);
  assert.equal(new Set(away.map((p) => p.id)).size, 10);
  assert.ok(home.some((p) => p.z > 0) && home.some((p) => p.z < 0));
  assert.ok(away.some((p) => p.z > 0) && away.some((p) => p.z < 0));
});

test('đồng đội chiếm khoảng trống, đối thủ gây áp lực có chọn lọc thay vì cả đội tụ vào bóng', () => {
  const home = createOutfieldRoster('home');
  const away = createOutfieldRoster('away');
  const controlled = home[CONTROLLED_SLOT];
  controlled.x = 0;
  controlled.z = 25;
  controlled.vx = 0.3;
  controlled.vz = -1;
  const homeAI = home.filter((_, i) => i !== CONTROLLED_SLOT);
  const initialHome = homeAI.map((p) => ({ x: p.x, z: p.z }));
  const initialAway = away.map((p) => ({ x: p.x, z: p.z }));
  const ball = { x: controlled.x, z: controlled.z, vx: controlled.vx, vz: controlled.vz, h: 0.59, inFlight: false };

  for (let frame = 0; frame < 120; frame += 1) {
    const dt = 1 / 60;
    updateTeamAI({ roster: homeAI, allies: home, opponents: away, ball, carrier: controlled, possession: 'home', dt, now: frame * dt });
    updateTeamAI({ roster: away, allies: away, opponents: home, ball, carrier: controlled, possession: 'home', dt, now: frame * dt });
  }

  assert.ok(homeAI.some((p, i) => Math.hypot(p.x - initialHome[i].x, p.z - initialHome[i].z) > 2), 'blue off-ball teammates should move into support positions');
  assert.ok(away.some((p, i) => Math.hypot(p.x - initialAway[i].x, p.z - initialAway[i].z) > 2), 'red defenders should press or shift their defensive block');
  const closestAway = [...away].sort((a, b) => Math.hypot(a.x - controlled.x, a.z - controlled.z) - Math.hypot(b.x - controlled.x, b.z - controlled.z));
  assert.ok(Math.hypot(closestAway[0].x - controlled.x, closestAway[0].z - controlled.z) < 15, 'the designated presser should close the carrier');
  assert.ok(away.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 30 && Math.abs(p.z) <= 47));
});

test('đội hình 10 cầu thủ sân của hai đội đối xứng đúng vai trò và hai nửa sân', () => {
  const home = createOutfieldRoster('home');
  const away = createOutfieldRoster('away');
  const roles = ['LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'CAM', 'ST'];

  assert.deepEqual(home.map((player) => player.role), roles);
  assert.deepEqual(away.map((player) => player.role), roles);
  for (let i = 0; i < roles.length; i += 1) {
    assert.equal(home[i].homeX, away[i].homeX);
    assert.equal(home[i].homeZ, -away[i].homeZ);
    assert.equal(home[i].yaw, 0);
    assert.equal(away[i].yaw, Math.PI);
  }
});

test('AI giữ tọa độ và vận tốc hữu hạn trong 60 giây mô phỏng đổi possession', () => {
  const home = createOutfieldRoster('home');
  const away = createOutfieldRoster('away');
  const controlled = home[CONTROLLED_SLOT];
  const homeAI = home.filter((_, i) => i !== CONTROLLED_SLOT);
  const awayCarrier = away[9];
  const ball = { x: 0, z: 0, vx: 0, vz: -23, h: 1.2, inFlight: true };
  const dt = 1 / 60;

  for (let frame = 0; frame < 3600; frame += 1) {
    const seconds = frame * dt;
    controlled.x = Math.sin(seconds * 0.75) * 24;
    controlled.z = Math.sin(seconds * 0.22) * 40;
    controlled.vx = Math.cos(seconds * 0.75) * 18;
    controlled.vz = Math.cos(seconds * 0.22) * 8.8;
    ball.x = Math.sin(seconds * 1.7) * 20;
    ball.z = Math.cos(seconds * 0.6) * 34;
    awayCarrier.vx = -Math.cos(seconds * 0.4) * 5;
    awayCarrier.vz = Math.sin(seconds * 0.4) * 5;

    const phase = Math.floor(frame / 600) % 3;
    const possession = ['home', 'neutral', 'away'][phase];
    const carrier = possession === 'home' ? controlled : possession === 'away' ? awayCarrier : ball;
    updateTeamAI({ roster: homeAI, allies: home, opponents: away, ball, carrier, possession, dt, now: seconds });
    updateTeamAI({ roster: away, allies: away, opponents: home, ball, carrier, possession, dt, now: seconds });
  }

  for (const player of [...homeAI, ...away]) {
    assert.ok(Number.isFinite(player.x) && Number.isFinite(player.z));
    assert.ok(Number.isFinite(player.vx) && Number.isFinite(player.vz));
    assert.ok(Math.abs(player.x) <= 30 && Math.abs(player.z) <= 47);
  }
});

test('reset đưa AI về đúng hai nửa sân và xóa động lượng cũ', () => {
  const away = createOutfieldRoster('away');
  away[0].x = 2;
  away[0].z = 0;
  away[0].vx = 8;
  away[0].vz = 4;
  resetOutfieldRoster(away);
  assert.equal(away[0].x, away[0].homeX);
  assert.equal(away[0].z, away[0].homeZ);
  assert.equal(away[0].vx, 0);
  assert.equal(away[0].vz, 0);
  assert.equal(away[0].yaw, Math.PI);
});
