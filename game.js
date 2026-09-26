import { makeCar, makeBall, stepCar, stepBall, collideCarBall, collideCars, resolveCarArena, jumpCar, FIELD, clamp } from './shared/physics.js';
import { PAD_POSITIONS } from './shared/pads.js';

export function sanitizeInput(input = {}) {
  const axis = value => typeof value === 'number' && Number.isFinite(value) ? clamp(value, -1, 1) : 0;
  return { throttle: axis(input.throttle), steer: axis(input.steer), boost: input.boost === true, drift: input.drift === true };
}
export class Match {
  constructor(id) {
    this.id = id;
    this.players = [null, null];
    this.inputs = [{}, {}];
    this.inputAt = [0, 0];
    this.reset();
  }
  resetPositions() {
    this.cars = [makeCar(), makeCar(-FIELD.halfLength * .52, Math.PI)];
    this.cars[0].team = 'home'; this.cars[1].team = 'away';
    this.ball = makeBall();
    this.pads = PAD_POSITIONS.map(([x,z]) => ({ x: x * 1.5, z: z * 1.5, cooldown: 0 }));
    this.inputs = [{}, {}];
  }
  reset() {
    this.resetPositions(); this.scores = [0,0]; this.remaining = 180;
    this.phase = this.players.every(Boolean) ? 'countdown' : 'waiting';
    this.phaseTime = 3; this.goalTeam = null; this.rematchVotes = [false, false];
  }
  add(player) {
    const slot = this.players.indexOf(null);
    if (slot < 0) throw new Error('This room is full.');
    this.players[slot] = player; this.reset(); return slot;
  }
  remove(slot) { this.players[slot] = null; this.reset(); }
  input(slot, input, now) { this.inputs[slot] = sanitizeInput(input); this.inputAt[slot] = now; }
  action(slot, action) {
    if (action === 'rematch' && this.phase === 'finished') {
      this.rematchVotes[slot] = true;
      if (this.rematchVotes.every(Boolean)) this.reset();
    }
    if (this.phase !== 'playing') return;
    if (action === 'jump') jumpCar(this.cars[slot], this.inputs[slot]);
    if (action === 'reset') {
      const old = this.cars[slot];
      this.cars[slot] = makeCar(slot ? -FIELD.halfLength * .52 : FIELD.halfLength * .52, slot ? Math.PI : 0);
      this.cars[slot].team = slot ? 'away' : 'home';
      this.cars[slot].boost = old.boost;
    }
  }
  step(dt, now) {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    if (this.phase === 'countdown' || this.phase === 'goal') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === 'goal') this.resetPositions();
        this.phase = this.remaining <= 0 ? 'finished' : 'playing';
      }
      return;
    }
    this.remaining = Math.max(0, this.remaining - dt);
    for (let i = 0; i < 2; i++) stepCar(this.cars[i], now - this.inputAt[i] < 300 ? this.inputs[i] : {}, dt);
    collideCars(...this.cars);
    for (const car of this.cars) { resolveCarArena(car); collideCarBall(car, this.ball); }
    const goal = stepBall(this.ball, dt, this.cars);
    if (goal) { this.scores[goal === 'home' ? 0 : 1]++; this.goalTeam = goal; this.phase = 'goal'; this.phaseTime = 3.8; }
    else if (this.remaining <= 0) this.phase = 'finished';
    for (const pad of this.pads) {
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      for (const car of this.cars) if (pad.cooldown === 0 && car.y < 2 && Math.hypot(car.x-pad.x, car.z-pad.z) < 2) {
        car.boost = clamp(car.boost + 32, 0, 100); pad.cooldown = 5;
      }
    }
  }
  snapshot() {
    return { type: 'state', roomId: this.id, players: this.players.map(Boolean), cars: this.cars, ball: this.ball,
      scores: this.scores, remaining: this.remaining, phase: this.phase, phaseTime: this.phaseTime,
      goalTeam: this.goalTeam, pads: this.pads.map(p => p.cooldown), rematchVotes: this.rematchVotes };
  }
}
