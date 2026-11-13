import { SERVICE_CONFIG, weightedChoice } from './ServiceConfig.js';

// Read the match clock instead of maintaining a second clock that could drift on pause/restart.
export class DifficultySystem {
  constructor({ gameMode = 'solo', elapsed = () => 0, config = SERVICE_CONFIG, random = Math.random } = {}) {
    this.mode = gameMode === 'coop' ? 'coop' : 'solo';
    this.elapsed = elapsed; this.config = config; this.random = random;
  }
  get index() {
    const seconds = Math.max(0, this.elapsed());
    let index = 0;
    this.config[this.mode].forEach((stage, i) => { if (seconds + 1e-8 >= stage.from) index = i; });
    return index;
  }
  get stage() { return this.config[this.mode][this.index]; }
  get maxOrders() { return this.stage.maxOrders; }
  get arrivalInterval() { return this.stage.arrivalInterval; }
  pickProfile() { return weightedChoice(this.stage.profiles, this.random); }
  pickOrderType() { return weightedChoice(this.stage.orders, this.random); }
}
