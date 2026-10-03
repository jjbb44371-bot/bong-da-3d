const STORAGE_KEY = 'dem-san-co.goalkeeper-q.v1';
const POSITION_BINS = 3;
const TARGET_BINS = 5;
const POWER_BINS = 3;
const STATE_COUNT = POSITION_BINS * TARGET_BINS * POWER_BINS;
const ACTIONS = [-5.9, 0, 5.9];
const ALPHA = 0.28;
const EPSILON_START = 0.24;
const EPSILON_FLOOR = 0.07;

function emptyTable() {
  return Array.from({ length: STATE_COUNT }, () => [0, 0, 0]);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function integer(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Bins encode strike location on the pitch, predicted goal-line position, and power. */
export function encodeShotState({ startX = 0, targetX = 0, power = 0 }) {
  const positionBin = startX < -6 ? 0 : startX > 6 ? 2 : 1;
  const targetBin = clamp(Math.floor((clamp(targetX, -8.25, 8.25) + 8.25) / 3.3), 0, TARGET_BINS - 1);
  const powerBin = power < 0.34 ? 0 : power < 0.68 ? 1 : 2;
  return (positionBin * TARGET_BINS + targetBin) * POWER_BINS + powerBin;
}

export class GoalkeeperRL {
  constructor({ storage = safeLocalStorage(), random = Math.random } = {}) {
    this.storage = storage;
    this.random = random;
    this.q = emptyTable();
    this.visits = Array(STATE_COUNT).fill(0);
    this.episodes = 0;
    this.saves = 0;
    this.goals = 0;
    this.totalShots = 0;
    this.pending = null;
    this.storageAvailable = Boolean(storage);
    this.load();
  }

  load() {
    if (!this.storage) return;
    try {
      const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.q) || parsed.q.length !== STATE_COUNT) return;
      this.q = parsed.q.map((row) => Array.from({ length: 3 }, (_, action) => {
        const value = Number(row?.[action]);
        return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
      }));
      if (Array.isArray(parsed.visits) && parsed.visits.length === STATE_COUNT) this.visits = parsed.visits.map(integer);
      this.episodes = integer(parsed.episodes);
      this.saves = integer(parsed.saves);
      this.goals = integer(parsed.goals);
      this.totalShots = integer(parsed.totalShots);
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        q: this.q,
        visits: this.visits,
        episodes: this.episodes,
        saves: this.saves,
        goals: this.goals,
        totalShots: this.totalShots,
      }));
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
    }
  }

  chooseAction(state, targetX) {
    const epsilon = Math.max(EPSILON_FLOOR, EPSILON_START * Math.exp(-this.episodes / 60));
    if (this.random() < epsilon) return { action: Math.floor(this.random() * ACTIONS.length), exploring: true };

    const values = this.q[state];
    const best = Math.max(...values);
    const candidates = values.map((value, index) => ({ value, index })).filter((entry) => Math.abs(entry.value - best) < 1e-9);
    if (candidates.length === 1) return { action: candidates[0].index, exploring: false };

    // When the table is new/tied, start from a sensible keeper prior; learned Q-values take over as evidence accumulates.
    const preferred = targetX < -2 ? 0 : targetX > 2 ? 2 : 1;
    const preferredTie = candidates.find((entry) => entry.index === preferred);
    return { action: preferredTie ? preferredTie.index : candidates[Math.floor(this.random() * candidates.length)].index, exploring: false };
  }

  beginShot({ startX = 0, targetX = 0, power = 0 }) {
    const normalized = { startX: Number(startX) || 0, targetX: Number(targetX) || 0, power: clamp(Number(power) || 0, 0, 1) };
    const state = encodeShotState(normalized);
    const selected = this.chooseAction(state, normalized.targetX);
    this.pending = { state, action: selected.action };
    this.totalShots += 1;
    this.visits[state] += 1;
    this.save();
    this.updateUI();
    return { state, action: selected.action, exploring: selected.exploring, targetX: ACTIONS[selected.action] };
  }

  resolveShot(outcome) {
    if (!this.pending || !['save', 'goal'].includes(outcome)) return null;
    const { state, action } = this.pending;
    this.pending = null;
    const reward = outcome === 'save' ? 1 : -1;
    // Terminal contextual Q-learning: Q(s,a) <- Q(s,a) + alpha * (reward - Q(s,a)).
    this.q[state][action] = clamp(this.q[state][action] + ALPHA * (reward - this.q[state][action]), -1, 1);
    this.episodes += 1;
    if (outcome === 'save') this.saves += 1;
    else this.goals += 1;
    this.save();
    this.updateUI();
    return { state, action, reward, value: this.q[state][action] };
  }

  discardShot() {
    this.pending = null;
  }

  reset() {
    this.q = emptyTable();
    this.visits = Array(STATE_COUNT).fill(0);
    this.episodes = 0;
    this.saves = 0;
    this.goals = 0;
    this.totalShots = 0;
    this.pending = null;
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
        this.storageAvailable = true;
      } catch {
        this.storageAvailable = false;
      }
    }
    this.updateUI();
  }

  getStatus() {
    return {
      episodes: this.episodes,
      saves: this.saves,
      goals: this.goals,
      totalShots: this.totalShots,
      statesSeen: this.visits.filter((count) => count > 0).length,
      stateCount: STATE_COUNT,
      storageAvailable: this.storageAvailable,
    };
  }

  updateUI() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('keeper-learning');
    const count = document.getElementById('keeper-learning-count');
    const detail = document.getElementById('keeper-learning-detail');
    if (!badge || !count || !detail) return;
    const status = this.getStatus();
    count.textContent = `${status.episodes} CÚ`;
    detail.textContent = `${status.statesSeen}/${status.stateCount} MẪU`;
    badge.title = `${status.episodes} kết quả đã học (${status.saves} cản phá, ${status.goals} bàn thua); đã gặp ${status.statesSeen}/${status.stateCount} tổ hợp vị trí–hướng–lực. ${status.storageAvailable ? 'Lưu chỉ trên thiết bị này.' : 'Bộ nhớ trình duyệt không khả dụng; dữ liệu chỉ tồn tại tới khi tải lại.'}`;
  }
}

export const goalkeeperRL = new GoalkeeperRL();

export function mountLearningControls(onReset = () => {}) {
  goalkeeperRL.updateUI();
  const button = typeof document === 'undefined' ? null : document.getElementById('reset-learning');
  if (!button || button.dataset.learningBound === 'true') return;
  button.dataset.learningBound = 'true';
  button.addEventListener('click', () => {
    goalkeeperRL.reset();
    const announcer = document.getElementById('announcer');
    if (announcer) announcer.textContent = 'Đã xóa bộ nhớ học cục bộ của thủ môn.';
    onReset();
  });
}
