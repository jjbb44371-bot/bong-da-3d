const FORMATION = [
  { role: 'LB', x: -23, z: 25, pace: 6.4, engagement: 0.72, lane: -1 },
  { role: 'LCB', x: -7, z: 29, pace: 5.8, engagement: 0.68, lane: -0.45 },
  { role: 'RCB', x: 7, z: 29, pace: 5.9, engagement: 0.7, lane: 0.45 },
  { role: 'RB', x: 23, z: 25, pace: 6.5, engagement: 0.74, lane: 1 },
  { role: 'LM', x: -22, z: 8, pace: 6.9, engagement: 0.66, lane: -1 },
  { role: 'LCM', x: -8, z: 10, pace: 6.4, engagement: 0.76, lane: -0.4 },
  { role: 'RCM', x: 8, z: 10, pace: 6.3, engagement: 0.73, lane: 0.4 },
  { role: 'RM', x: 22, z: 8, pace: 6.9, engagement: 0.67, lane: 1 },
  { role: 'CAM', x: 0, z: 1, pace: 7.1, engagement: 0.7, lane: 0 },
  { role: 'ST', x: 7, z: -11, pace: 7.2, engagement: 0.63, lane: 0.3 },
];

export const CONTROLLED_SLOT = 8;
export const FIELD_PLAYERS_PER_TEAM = 10;
export const PLAYERS_PER_TEAM = 11;

export function createOutfieldRoster(team) {
  const home = team === 'home';
  return FORMATION.map((slot, index) => {
    const direction = home ? -1 : 1;
    return {
      id: `${team}-${index + 1}`,
      team,
      role: slot.role,
      lane: slot.lane,
      homeX: slot.x,
      homeZ: slot.z * direction,
      x: slot.x,
      z: slot.z * direction,
      yaw: home ? 0 : Math.PI,
      vx: 0,
      vz: 0,
      step: 0,
      moving: false,
      pace: slot.pace,
      engagement: slot.engagement,
      decisionTimer: 0,
    };
  });
}

export function resetOutfieldRoster(roster) {
  for (const player of roster) {
    player.x = player.homeX;
    player.z = player.homeZ;
    player.vx = 0;
    player.vz = 0;
    player.step = 0;
    player.moving = false;
    player.yaw = player.team === 'home' ? 0 : Math.PI;
    player.decisionTimer = 0;
  }
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function openLaneTarget(agent, base, opponents, allies) {
  const candidates = [-9, -5, 0, 5, 9].map((offset) => clamp(base.x + offset, -27, 27));
  let bestX = candidates[0];
  let bestScore = -Infinity;
  for (const x of candidates) {
    let closestOpponent = 12;
    for (const opponent of opponents) {
      closestOpponent = Math.min(closestOpponent, Math.hypot(opponent.x - x, opponent.z - base.z));
    }
    let teammateCrowding = 0;
    for (const teammate of allies) {
      if (teammate === agent) continue;
      const gap = Math.hypot(teammate.x - x, teammate.z - base.z);
      teammateCrowding += Math.max(0, 4.5 - gap);
    }
    const travel = Math.hypot(x - agent.x, base.z - agent.z);
    // Prefer support points that are not already occupied by our own runners.
    const score = closestOpponent * 0.72 - travel * 0.16 - Math.abs(x - base.x) * 0.12 - Math.min(teammateCrowding, 7) * 0.65;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return { x: bestX, z: base.z };
}

function chooseTarget(agent, roster, allies, opponents, ball, carrier, possession, now) {
  const attacking = possession === agent.team;
  const direction = agent.team === 'home' ? -1 : 1;
  const targetPoint = carrier || ball;
  const ranked = roster
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex, distance: distance(candidate, targetPoint) }))
    .sort((a, b) => a.distance - b.distance || String(a.candidate.id).localeCompare(String(b.candidate.id)));
  const pressPlayer = ranked[0]?.candidate ?? null;
  const coverPlayer = ranked[1]?.candidate ?? null;
  const agentDistance = distance(agent, targetPoint);

  if (attacking && carrier && carrier !== agent) {
    let base;
    if (agent.role === 'LB' || agent.role === 'RB') {
      const overlap = Math.abs(carrier.x) > 13 ? 7 : 3;
      base = { x: agent.homeX * 0.74, z: carrier.z + direction * overlap };
    } else if (agent.role === 'LCB' || agent.role === 'RCB') {
      base = { x: agent.homeX * 0.78 + carrier.x * 0.22, z: carrier.z - direction * 11 };
    } else if (agent.role === 'LM' || agent.role === 'RM') {
      base = { x: agent.homeX * 0.68 + carrier.x * 0.32, z: carrier.z + direction * 5 };
    } else if (agent.role === 'LCM' || agent.role === 'RCM') {
      base = { x: carrier.x * 0.55 + agent.homeX * 0.45, z: carrier.z + direction * 7 };
    } else if (agent.role === 'CAM') {
      base = { x: carrier.x + (agent.homeX - carrier.x) * 0.28, z: carrier.z + direction * 6 };
    } else {
      base = { x: carrier.x + agent.homeX * 0.42, z: carrier.z + direction * 11 };
    }
    const lane = openLaneTarget(agent, base, opponents, allies);
    lane.x = clamp(lane.x + Math.sin(now * 0.78 + agent.lane * 2.4) * 0.9, -29, 29);
    return lane;
  }

  const pressRange = 15 + agent.engagement * 12;
  if (!attacking && carrier && agent === pressPlayer && agentDistance < pressRange) {
    const predict = clamp(0.28 + agent.engagement * 0.25, 0.3, 0.58);
    const predicted = {
      x: carrier.x + (carrier.vx || 0) * predict,
      z: carrier.z + (carrier.vz || 0) * predict,
    };
    const offset = agent.lane < 0 ? -1.55 : 1.55;
    return { x: clamp(predicted.x + offset, -30, 30), z: clamp(predicted.z + (direction * 0.45), -48, 48) };
  }
  if (!attacking && carrier && agent === coverPlayer && agentDistance < pressRange + 5) {
    const goalSide = -direction;
    return {
      x: clamp(carrier.x + (agent.lane < 0 ? -4.2 : 4.2), -28, 28),
      z: clamp(carrier.z + goalSide * (4.5 + agent.engagement * 2), -46, 46),
    };
  }

  // The remaining players slide as a compact block rather than all chasing the ball.
  const compactX = agent.homeX * 0.82 + ball.x * 0.18;
  const lineShift = clamp((ball.z - agent.homeZ) * 0.14, -7, 7);
  return {
    x: clamp(compactX, -29, 29),
    z: clamp(agent.homeZ + lineShift, -46, 46),
  };
}

export function updateTeamAI({ roster, allies = roster, opponents = [], ball, carrier = null, possession = null, dt, now = 0 }) {
  if (!Array.isArray(roster) || roster.length === 0) return;
  const snapshots = new Map();
  const snapshot = (player) => {
    if (!player || typeof player !== 'object') return player;
    if (!snapshots.has(player)) snapshots.set(player, { ...player });
    return snapshots.get(player);
  };
  const readRoster = roster.map(snapshot);
  const readAllies = allies.map(snapshot);
  const readOpponents = opponents.map(snapshot);
  const readBall = snapshot(ball);
  const readCarrier = snapshot(carrier);
  const nextStates = roster.map((agent, index) => {
    const previous = readRoster[index];
    const target = chooseTarget(previous, readRoster, readAllies, readOpponents, readBall, readCarrier, possession, now);
    let dx = target.x - previous.x;
    let dz = target.z - previous.z;

    for (const teammate of readAllies) {
      if (teammate === previous) continue;
      const awayX = previous.x - teammate.x;
      const awayZ = previous.z - teammate.z;
      const gap = Math.hypot(awayX, awayZ);
      if (gap > 0.04 && gap < 1.65) {
        const weight = (1.65 - gap) / 1.65;
        dx += (awayX / gap) * weight * 2.2;
        dz += (awayZ / gap) * weight * 2.2;
      }
    }

    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      dx /= length;
      dz /= length;
    }
    const speed = previous.pace * (possession === previous.team ? 0.96 : 1);
    const blend = 1 - Math.exp(-dt * 4.7);
    let vx = previous.vx + (dx * speed - previous.vx) * blend;
    let vz = previous.vz + (dz * speed - previous.vz) * blend;
    if (length < 0.42) {
      const settle = Math.exp(-dt * 5.3);
      vx *= settle;
      vz *= settle;
    }
    const x = clamp(previous.x + vx * dt, -30, 30);
    const z = clamp(previous.z + vz * dt, -47, 47);
    const moving = Math.hypot(vx, vz) > 0.55;
    let yaw = previous.yaw;
    if (moving) {
      const heading = Math.atan2(vx, -vz);
      const delta = (heading - previous.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      yaw += delta * Math.min(1, dt * 9);
    }
    return { agent, x, z, vx, vz, moving, yaw, step: previous.step + dt * (moving ? 8.5 + previous.pace * 0.25 : 2.2) };
  });
  for (const { agent, ...nextState } of nextStates) Object.assign(agent, nextState);
}
