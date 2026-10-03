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
