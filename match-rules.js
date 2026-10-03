export const BALL_RADIUS = 0.58;
export const GOAL_HALF_WIDTH = 8.35;
export const GOAL_POST_RADIUS = 0.16;
export const GOAL_CROSSBAR_HEIGHT = 4.05;
export const GOAL_CROSSBAR_RADIUS = 0.16;
export const AWAY_GOAL_LINE_Z = -54.6;
export const HOME_GOAL_LINE_Z = 54.6;
export const AWAY_GOAL_SCORE_PLANE_Z = AWAY_GOAL_LINE_Z - BALL_RADIUS;

// Chỉ công nhận bóng lọt hoàn toàn giữa/trên các bề mặt cột và xà.
export const GOAL_MOUTH_CENTER_HALF_WIDTH = GOAL_HALF_WIDTH - GOAL_POST_RADIUS - BALL_RADIUS;
export const GOAL_MOUTH_CENTER_MAX_HEIGHT = GOAL_CROSSBAR_HEIGHT - GOAL_CROSSBAR_RADIUS - BALL_RADIUS;

export function ballFitsGoalMouth(ball) {
  return Math.abs(ball.x) < GOAL_MOUTH_CENTER_HALF_WIDTH && ball.h < GOAL_MOUTH_CENTER_MAX_HEIGHT;
}

// Nội suy vị trí quả bóng tại mặt phẳng vạch cầu môn trên đoạn của một bước mô phỏng.
export function goalPlaneCrossing(previous, current, goalZ = AWAY_GOAL_SCORE_PLANE_Z) {
  if (!(previous.z >= goalZ && current.z < goalZ)) return null;
  const spanZ = current.z - previous.z;
  if (spanZ === 0) return null;
  const fraction = (goalZ - previous.z) / spanZ;
  return {
    x: previous.x + (current.x - previous.x) * fraction,
    z: goalZ,
    h: previous.h + (current.h - previous.h) * fraction,
    fraction,
  };
}

export function formatGoalAnnouncement(score) {
  return `Bàn thắng! Tỉ số ${score}–0. Còn ${Math.max(0, 3 - score)} bàn để thắng.`;
}

// Dùng cùng hệ số 60 Hz để kết quả gần như độc lập với tốc độ khung hình.
export function applyBallFlightDamping(ball, dt) {
  const damping = Math.pow(0.999, dt * 60);
  ball.vx *= damping;
  ball.vz *= damping;
}

// Trục +Z hướng ra sân từ khung thành đội khách đang được tấn công.
export function keeperReboundVelocity(incomingVz) {
  return Math.max(2.2, Math.abs(incomingVz) * 0.16);
}
