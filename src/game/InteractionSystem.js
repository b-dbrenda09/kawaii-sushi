import { Vector3 } from 'three';

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
});

export class InteractionSystem {
  constructor({ stations = [], collisionSystem, ui = null, onInteract = null, carrySystem = null,
    maxDistance = 1, switchMargin = 0.08, feedbackDuration = 1.6 } = {}) {
    this.stations = new Map();
    this.collisionSystem = collisionSystem;
    this.ui = ui;
    this.onInteract = onInteract;
    this.carrySystem = carrySystem;
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
    const defaults = STATION_INTERACTIONS[station.id];
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

  measure(entry, player) {
    const position = player.group.position;
    const b = entry.station.collider.bounds;
    this.contact.set(Math.max(b.minX, Math.min(b.maxX, position.x)), 0,
      Math.max(b.minZ, Math.min(b.maxZ, position.z)));
    const dx = this.contact.x - position.x;
    const dz = this.contact.z - position.z;
    const distance = Math.hypot(dx, dz);
    // Centros inválidos dentro do móvel também não podem acionar a estação.
    if (distance < player.collider.radius - 1e-6 || distance > this.maxDistance) return null;
    const area = entry.station.interactionArea;
    if (area && Math.hypot(position.x - area.position.x, position.z - area.position.z) > area.radius) return null;
    if (!this.collisionSystem?.hasLineOfSight(position, this.contact, entry.station.id)) return null;
    const alignment = (Math.sin(player.group.rotation.y) * dx + Math.cos(player.group.rotation.y) * dz) / distance;
    return { entry, distance, alignment };
  }

  update(deltaTime, player, { interactPressed = false, disabled = false } = {}) {
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
      const candidate = this.measure(entry, player);
      if (!candidate) continue;
      if (entry === this.active) current = candidate;
      if (!best || candidate.distance < best.distance - 1e-6
        || (Math.abs(candidate.distance - best.distance) <= 1e-6 && (candidate.alignment > best.alignment + 1e-6
          || (Math.abs(candidate.alignment - best.alignment) <= 1e-6 && entry.station.id < best.entry.station.id)))) {
        best = candidate;
      }
    }
    // Mantém a seleção nos empates e pequenas oscilações, sempre dentro do alcance.
    if (current && best && current.distance <= best.distance + this.switchMargin) best = current;
    this.active = best?.entry ?? null;
    if (this.active && this.carrySystem) Object.assign(this.active, this.carrySystem.describe(this.active.station));
    let event = null;
    if (interactPressed && this.active) {
      event = { station: this.active.station, stationId: this.active.station.id, action: this.active.action };
      const result = this.carrySystem?.interact(this.active.station);
      if (result) Object.assign(event, result);
      this.message = result?.message ?? this.active.confirmation ?? 'Estação selecionada';
      this.feedbackRemaining = this.feedbackDuration;
      this.active.onInteract?.(event);
      this.onInteract?.(event);
      if (this.active && this.carrySystem) Object.assign(this.active, this.carrySystem.describe(this.active.station));
    }
    this.ui?.render(this.active, this.message);
    return event;
  }

  reset() {
    this.active = null;
    this.message = '';
    this.feedbackRemaining = 0;
    this.ui?.render(null, '');
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.stations.clear();
    this.disposed = true;
  }
}
