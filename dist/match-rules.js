export const BALL_RADIUS = 0.58;
export const GOAL_HALF_WIDTH = 8.35;
export const GOAL_POST_RADIUS = 0.16;
export const GOAL_CROSSBAR_HEIGHT = 4.05;
export const GOAL_CROSSBAR_RADIUS = 0.16;

// Chỉ công nhận bóng lọt hoàn toàn giữa/trên các bề mặt cột và xà.
export const GOAL_MOUTH_CENTER_HALF_WIDTH = GOAL_HALF_WIDTH - GOAL_POST_RADIUS - BALL_RADIUS;
export const GOAL_MOUTH_CENTER_MAX_HEIGHT = GOAL_CROSSBAR_HEIGHT - GOAL_CROSSBAR_RADIUS - BALL_RADIUS;

export function ballFitsGoalMouth(ball) {
  return Math.abs(ball.x) < GOAL_MOUTH_CENTER_HALF_WIDTH && ball.h < GOAL_MOUTH_CENTER_MAX_HEIGHT;
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
