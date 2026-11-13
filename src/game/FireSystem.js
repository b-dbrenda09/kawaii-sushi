import { FIRE_CONFIG } from './FireConfig.js';
import { FirePropagationRoute } from './FirePropagationRoute.js';

export class FireSystem {
  constructor({ stations, extinguisher = null, effects = null, sound = null, config = {}, collisionSystem = null }) {
    this.config = Object.freeze({ ...FIRE_CONFIG, ...config });
    for (const [key, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value < 0 || (!['progressGrace', 'progressDecay'].includes(key) && value === 0)) throw new Error(`Configuração de incêndio inválida: ${key}`);
    }
    this.stations = new Map([...stations.values()].filter(station => !station.fireproof && station.type !== 'trash').map(station => [station.id, station]));
    this.extinguisher = extinguisher; this.effects = effects; this.sound = sound;
    this.fires = new Map(); this.visited = new Set(); this.users = new Map();
    this.time = 0; this.nextSpreadAt = Infinity; this.incident = 0;
    this.routes = new FirePropagationRoute(this.stations, collisionSystem);
    this.pendingSpread = null;
    for (const station of this.stations.values()) { station.fireSystem = this; station.fireState = 'normal'; }
  }

  isBurning(station) { return this.fires.has(typeof station === 'string' ? station : station?.id); }

  ignite(station, { at = this.time, cause = 'rice' } = {}) {
    if (this.disposed || this.stations.get(station?.id) !== station || this.visited.has(station.id) || !Number.isFinite(at)) return false;
    if (!this.fires.size) {
      this.visited.clear(); this.incident++;
      this.nextSpreadAt = at + this.config.spreadInterval;
      this.sound?.playFireAlert?.();
    }
    this.visited.add(station.id);
    this.fires.set(station.id, { station, startedAt: at, cause, progress: 0, lastSprayAt: -Infinity });
    station.fireState = 'burning';
    station.behavior?.cancelStroke?.();
    station.behavior?.resetCancellation?.();
    station.interactingPlayer = null;
    this.effects?.ignite(station);
    if (this.pendingSpread?.target === station) this.cancelSpread();
    if (!this.pendingSpread) this.scheduleSpread(at);
    return true;
  }

  scheduleSpread(at = this.time) {
    if (this.pendingSpread || !this.fires.size) return;
    const candidates = [];
    for (const { station: source } of this.fires.values()) for (const station of this.stations.values()) {
      if (this.visited.has(station.id)) continue;
      const d = source.position.distanceTo(station.position);
      if (d <= this.config.spreadDistance) candidates.push({ source, target: station, distance: d });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id) || a.source.id.localeCompare(b.source.id));
    for (const { source, target } of candidates) {
      const path = this.routes.path(source, target); if (!path) continue;
      this.pendingSpread = { source, target, path, startedAt: at, endsAt: at + this.config.spreadInterval };
      this.nextSpreadAt = this.pendingSpread.endsAt;
      target.fireThreatened = true; this.effects?.setPropagation(this.pendingSpread);
      return;
    }
    this.nextSpreadAt = Infinity;
  }

  cancelSpread() {
    if (this.pendingSpread) this.pendingSpread.target.fireThreatened = false;
    this.pendingSpread = null; this.nextSpreadAt = Infinity; this.effects?.setPropagation(null);
  }

  durationFor(fire) {
    if (fire.suppressionDuration) return fire.suppressionDuration;
    const age = Math.max(0, this.time - fire.startedAt);
    return Math.min(2, age + 1e-9 < this.config.mediumAge ? this.config.smallExtinguishDuration :
      age + 1e-9 < this.config.largeAge ? this.config.mediumExtinguishDuration : this.config.extinguishDuration);
  }

  update(dt) {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    const start = this.time, end = start + dt;
    if (this.pendingSpread && (!this.isBurning(this.pendingSpread.source) || !this.routes.valid(this.pendingSpread.source, this.pendingSpread.target, this.pendingSpread.path))) this.cancelSpread();
    if (!this.pendingSpread) this.scheduleSpread(start);
    while (this.pendingSpread && this.pendingSpread.endsAt <= end + 1e-9) {
      const pending = this.pendingSpread;
      this.time = pending.endsAt;
      this.cancelSpread();
      if (this.isBurning(pending.source) && !this.visited.has(pending.target.id)) this.ignite(pending.target, { at: this.time, cause: 'spread' });
      if (!this.pendingSpread) this.scheduleSpread(this.time);
    }
    for (const fire of this.fires.values()) {
      const decayTime = Math.max(0, end - Math.max(start, fire.startedAt, fire.lastSprayAt + this.config.progressGrace));
      fire.progress = Math.max(0, fire.progress - decayTime * this.config.progressDecay);
      if (!fire.progress) fire.suppressionDuration = null;
    }
    this.time = end;
    this.effects?.update(dt, this);
  }

  targetFor(context) {
    const { player, interactionSystem, input } = context;
    const preferred = input.mouseNavigation?.station;
    const previous = this.users.get(player.id)?.station;
    const choices = preferred ? [preferred] : [previous, ...this.stations.values()];
    let target = null, distance = Infinity;
    for (const station of choices) {
      if (!this.isBurning(station) || !interactionSystem.canApproach(station, player, player.group.position)) continue;
      const b = station.collider.bounds, p = player.group.position;
      const d = Math.hypot(p.x - Math.max(b.minX, Math.min(b.maxX, p.x)), p.z - Math.max(b.minZ, Math.min(b.maxZ, p.z)));
      if (d < distance - 1e-6) { target = station; distance = d; }
    }
    return target;
  }

  updateActions(dt, contexts) {
    if (this.disposed) return;
    const seen = new Set();
    for (const context of contexts) {
      const { player, carrySystem, input } = context; seen.add(player.id);
      if (input.consumeDrop?.() && carrySystem.carriedTool === this.extinguisher) {
        this.stopSpraying(player);
        const result = this.extinguisher.drop(carrySystem);
        context.interactionSystem.message = result.message; context.interactionSystem.feedbackRemaining = 1.6;
        input.consumeInteraction();
        if (result.success) continue;
      }
      const held = input.isInteractionHeld?.() && carrySystem.carriedTool === this.extinguisher && this.extinguisher?.owner === carrySystem;
      const target = held && !player.cutAction && player.dashRemaining <= 0 ? this.targetFor(context) : null;
      if (!target) { this.stopSpraying(player); continue; }
      if (!player.beginExtinguishing(target.position)) { this.stopSpraying(player); continue; }
      this.extinguisher.aimAt?.(target);
      if (!this.users.has(player.id)) this.sound?.playExtinguisher?.();
      this.users.set(player.id, { player, station: target });
      const fire = this.fires.get(target.id);
      fire.suppressionDuration ??= this.durationFor(fire);
      fire.lastSprayAt = this.time;
      fire.progress = Math.min(fire.suppressionDuration, fire.progress + Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .05)));
      this.effects?.spray(player, target);
      if (fire.progress + 1e-9 >= fire.suppressionDuration) this.extinguish(target);
    }
    for (const { player } of this.users.values()) if (!seen.has(player.id)) this.stopSpraying(player);
  }

  extinguish(station) {
    if (!this.isBurning(station)) return false;
    this.fires.delete(station.id); station.fireState = 'normal';
    if (this.pendingSpread?.source === station) this.cancelSpread();
    for (const { player, station: target } of this.users.values()) if (target === station) this.stopSpraying(player);
    // Only burnt rice is discarded. Other contents remain owned by their original station.
    if (station.type === 'riceCooker' && station.behavior?.state === 'BURNT') station.behavior.discardBurnt();
    this.effects?.recover(station); this.sound?.playFireOut?.();
    if (!this.fires.size) {
      this.visited.clear(); this.nextSpreadAt = Infinity;
      for (const candidate of this.stations.values()) {
        const cooker = candidate.type === 'riceCooker' && candidate.behavior;
        if (cooker?.state === 'BURNT' && cooker.fireAttempted) { cooker.fireAttempted = false; cooker.elapsed = 0; }
      }
    }
    return true;
  }

  stopSpraying(player) {
    if (this.users.has(player.id)) this.sound?.stopExtinguisher?.();
    if (this.extinguisher?.owner?.player === player) this.extinguisher.resetAim?.();
    this.users.delete(player.id); player.endExtinguishing?.(); this.effects?.spray(player, null);
  }
  stopAllSpraying() { for (const { player } of [...this.users.values()]) this.stopSpraying(player); }

  dispose() {
    if (this.disposed) return;
    this.stopAllSpraying(); this.disposed = true;
    this.cancelSpread();
    for (const station of this.stations.values()) {
      station.fireState = 'normal'; if (station.fireSystem === this) delete station.fireSystem;
    }
    this.fires.clear(); this.visited.clear(); this.effects?.dispose();
  }
}
