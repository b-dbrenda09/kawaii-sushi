export class FireUI {
  constructor(container) {
    const doc = container.ownerDocument;
    this.root = doc.createElement('div'); this.root.className = 'fire-hud'; this.root.hidden = true;
    this.root.setAttribute('role', 'status'); this.root.setAttribute('aria-live', 'polite');
    this.alert = doc.createElement('div'); this.alert.className = 'fire-alert'; this.alert.hidden = true;
    this.alert.setAttribute('role', 'alert'); this.alert.textContent = 'CUIDADO! A COZINHA ESTÁ PEGANDO FOGO!';
    container.append(this.root, this.alert); this.incident = 0; this.remaining = 0;
  }
  update(dt, system) {
    if (system.incident !== this.incident) { this.incident = system.incident; this.remaining = 4; }
    else this.remaining = Math.max(0, this.remaining - dt);
    const count = system.fires.size;
    this.root.hidden = count === 0; this.alert.hidden = !count || this.remaining === 0;
    const text = count === 1 ? '🔥 1 estação incendiando' : `🔥 ${count} estações incendiando`;
    if (this.root.textContent !== text) this.root.textContent = text;
  }
  dispose() { this.root.remove(); this.alert.remove(); }
}
