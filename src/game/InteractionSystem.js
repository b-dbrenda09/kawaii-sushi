import { Vector3, BufferGeometry, LineLoop, LineBasicMaterial } from 'three';
import { BALANCE } from './Balance.js';

export const STATION_INTERACTIONS = Object.freeze({
  salmonBox: { action: 'Pegar salmão', confirmation: 'Estação de salmão selecionada' },
  riceBox: { action: 'Pegar arroz', confirmation: 'Estação de arroz selecionada' },
  cucumberBox: { action: 'Pegar pepino', confirmation: 'Estação de pepino selecionada' },
  noriBox: { action: 'Pegar nori', confirmation: 'Estação de nori selecionada' },
  cutting: { action: 'Cortar', confirmation: 'Bancada de corte selecionada' },
  riceCooker: { action: 'Cozinhar arroz', confirmation: 'Panela elétrica selecionada' },
  assembly: { action: 'Montar sushi', confirmation: 'Ilha de montagem selecionada' },
  delivery: { action: 'Entregar pedido', confirmation: 'Balcão de entrega selecionado' },
  trash: { action: 'Descartar', confirmation: 'Lixeira selecionada' },
  extinguisher: { action: 'Pegar extintor', confirmation: 'Extintor selecionado' },
});

export class InteractionSystem {
  constructor({ stations = [], collisionSystem, ui = null, onInteract = null, carrySystem = null,
    fireSystem = null, maxDistance = BALANCE.interaction.maxDistance, switchMargin = 0.08, feedbackDuration = 1.6 } = {}) {
    this.stations = new Map();
    this.collisionSystem = collisionSystem;
    this.ui = ui;
    this.onInteract = onInteract;
    this.carrySystem = carrySystem;
    this.fireSystem = fireSystem;
    this.maxDistance = maxDistance;
    this.switchMargin = switchMargin;
    this.feedbackDuration = feedbackDuration;
    this.feedbackRemaining = 0;
    this.message = '';
    this.active = null;
    this.contact = new Vector3();
    this.disposed = false;
    for (const station of stations) this.registerStation(station);
  }

  get activeStation() {
    return this.active?.station ?? null;
  }

  registerStation(station, options = {}) {
    const defaults = STATION_INTERACTIONS[station.type];
    if (!station.collider?.bounds || (!defaults && !options.action)) throw new Error(`Estação interativa inválida: ${station.id}`);
    const entry = { station, ...defaults, ...options };
    this.stations.set(station.id, entry);
    if (this.active?.station.id === station.id) this.reset();
    return entry;
  }

  unregisterStation(id) {
    if (this.active?.station.id === id) this.reset();
    return this.stations.delete(id);
  }

  canApproach(station, player, position) {
    const entry = this.stations.get(station.id);
    return Boolean(entry && this.measure(entry, player, position, false));
  }

  measure(entry, player, position = player.group.position, checkAvailability = true) {
    if (entry.station.interactionEnabled === false) return null;
    const b = entry.station.collider.bounds;
    this.contact.set(Math.max(b.minX, Math.min(b.maxX, position.x)), 0,
      Math.max(b.minZ, Math.min(b.maxZ, position.z)));
    const dx = this.contact.x - position.x;
    const dz = this.contact.z - position.z;
    const distance = Math.hypot(dx, dz);
    // Centros inválidos dentro do móvel também não podem acionar a estação.
    if (distance < player.collider.radius - 1e-6 || distance > Math.min(this.maxDistance, entry.station.interactionReach ?? this.maxDistance)) return null;
    if (entry.station.accessibleFront) {
      const offsetX = position.x - entry.station.position.x, offsetZ = position.z - entry.station.position.z;
      if (offsetX * entry.station.front.x + offsetZ * entry.station.front.z < entry.station.localDimensions.depth / 2 + player.collider.radius - 1e-6) return null;
    }
    const area = entry.station.interactionArea;
    if (area && Math.hypot(position.x - area.position.x, position.z - area.position.z) > area.radius) return null;
    if (!this.collisionSystem?.hasLineOfSight(position, this.contact, entry.station.id)) return null;
    const alignment = (Math.sin(player.group.rotation.y) * dx + Math.cos(player.group.rotation.y) * dz) / distance;
    const available = !checkAvailability || this.carrySystem?.describe(entry.station).available !== false;
    return { entry, distance, alignment, available };
  }

  update(deltaTime, player, { interactPressed = false, disabled = false, preferredStation = null } = {}) {
    if (this.disposed) return null;
    deltaTime = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, 0.05)) : 0;
    if (disabled || player.state === 'dashing' || player.dashRemaining > 0) {
      this.reset();
      return null;
    }
    this.feedbackRemaining = Math.max(0, this.feedbackRemaining - deltaTime);
    if (this.feedbackRemaining === 0) this.message = '';
    let best = null;
    let current = null;
    for (const entry of this.stations.values()) {
      if (preferredStation && entry.station !== preferredStation) continue;
      const candidate = this.measure(entry, player);
      if (!candidate) continue;
      if (entry === this.active) current = candidate;
      const closer = !best || candidate.distance < best.distance - 1e-6;
      const tie = best && Math.abs(candidate.distance - best.distance) <= 1e-6;
      const facing = best && (candidate.alignment > best.alignment + 1e-6
        || (Math.abs(candidate.alignment - best.alignment) <= 1e-6 && entry.station.id < best.entry.station.id));
      if (!best || (candidate.available && !best.available) || (candidate.available === best.available && (closer || (tie && facing)))) {
        best = candidate;
      }
    }
    // Mantém a seleção nos empates e pequenas oscilações, sempre dentro do alcance.
    if (current && best && current.available === best.available && current.distance <= best.distance + this.switchMargin) best = current;
    this.active = best?.entry ?? null;
    if (this.active && this.carrySystem) Object.assign(this.active, this.carrySystem.describe(this.active.station));
    let event = null;
    if (interactPressed && this.active) {
      event = { playerId: player.id ?? 'player', station: this.active.station, stationId: this.active.station.id, action: this.active.action };
      const result = this.fireSystem?.isBurning(this.active.station) && !this.carrySystem?.carriedTool
        ? { success: false, kind: 'burning', message: 'Estação em chamas!' }
        : this.carrySystem?.interact(this.active.station);
      if (result) Object.assign(event, result);
      this.message = result?.message ?? this.active.confirmation ?? 'Estação selecionada';
      this.feedbackRemaining = this.feedbackDuration;
      this.active.onInteract?.(event);
      this.onInteract?.(event);
      if (this.active && this.carrySystem) Object.assign(this.active, this.carrySystem.describe(this.active.station));
    }
    this.updateHighlight(player);
    this.ui?.render(this.active, this.message);
    return event;
  }

  reset() {
    this.active = null;
    this.message = '';
    this.feedbackRemaining = 0;
    if (this.highlight) this.highlight.visible = false;
    this.ui?.render(null, '');
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.stations.clear();
    this.highlight?.removeFromParent(); this.highlight?.geometry.dispose(); this.highlight?.material.dispose();
    this.disposed = true;
  }

  updateHighlight(player) {
    const station = this.activeStation;
    if (!station || this.active.available === false || player.movementLocked
      || (station.interactingPlayer && station.interactingPlayer !== player)) { if (this.highlight) this.highlight.visible = false; return; }
    if (!this.highlight) {
      const points = [[-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5]].map(p => new Vector3(...p));
      this.highlight = new LineLoop(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: this.carrySystem?.player?.id === 'p2' ? '#83c8e8' : '#e883b6' }));
      this.highlight.name = 'selected-station-highlight';
    }
    const parent = station.model.parent;
    if (parent && this.highlight.parent !== parent) parent.add(this.highlight);
    const margin = player.id === 'p2' ? 0.10 : 0.04;
    const { width, depth, height } = station.localDimensions ?? station.dimensions;
    this.highlight.position.copy(station.model.position);
    this.highlight.position.y += (height + 0.025) * station.model.scale.y;
    this.highlight.quaternion.copy(station.model.quaternion);
    this.highlight.scale.set((width + margin) * station.model.scale.x, 1, (depth + margin) * station.model.scale.z);
    this.highlight.visible = true;
  }
}
