export class InteractionUI {
  constructor(container) {
    const document = container.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'interaction-ui';
    this.hint = document.createElement('div');
    this.hint.className = 'interaction-hint';
    this.hint.setAttribute('role', 'status');
    this.hint.setAttribute('aria-live', 'polite');
    const key = document.createElement('kbd');
    key.textContent = 'E';
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
    if (this.action.textContent !== (active?.action ?? '')) this.action.textContent = active?.action ?? '';
    this.hint.dataset.available = active?.available === false ? 'false' : 'true';
    this.key.hidden = active?.showKey === false;
    this.hint.hidden = !active;
    if (this.feedback.textContent !== message) this.feedback.textContent = message;
    this.feedback.hidden = !message;
  }

  dispose() {
    this.root.remove();
  }
}
