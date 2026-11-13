export class InteractionUI {
  constructor(container, { playerId = null, keyLabel = 'E' } = {}) {
    const document = container.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'interaction-ui';
    if (playerId) this.root.dataset.player = playerId;
    this.playerLabel = playerId ? (playerId === 'p2' ? 'P2 · ' : 'P1 · ') : '';
    this.hint = document.createElement('div');
    this.hint.className = 'interaction-hint';
    this.hint.setAttribute('role', 'status');
    this.hint.setAttribute('aria-live', 'polite');
    const key = document.createElement('kbd');
    key.textContent = keyLabel;
    this.key = key;
    this.action = document.createElement('span');
    this.hint.append(key, this.action);
    this.feedback = document.createElement('div');
    this.feedback.className = 'interaction-feedback';
    this.feedback.setAttribute('role', 'status');
    this.feedback.setAttribute('aria-live', 'polite');
    this.root.append(this.feedback, this.hint);
    container.appendChild(this.root);
    this.render(null, '');
  }

  render(active, message) {
    const id = active?.station.id ?? '';
    if (this.hint.dataset.stationId !== id) {
      this.hint.dataset.stationId = id;
    }
    if (this.action.textContent !== (active ? this.playerLabel + active.action : '')) this.action.textContent = active ? this.playerLabel + active.action : '';
    this.hint.dataset.available = active?.available === false ? 'false' : 'true';
    this.key.hidden = active?.showKey === false || active?.available === false;
    this.hint.hidden = !active;
    if (this.feedback.textContent !== message) this.feedback.textContent = message;
    this.feedback.hidden = !message;
  }

  dispose() {
    this.root.remove();
  }
}
