import { Vector3 } from 'three';

export class RiceCookerUI {
  constructor(container, station) {
    this.station = station;
    this.container = container;
    this.point = new Vector3();
    const document = container.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'rice-cooker-status';
    this.root.hidden = true;
    this.label = document.createElement('div');
    this.label.className = 'rice-cooker-label';
    this.label.setAttribute('role', 'status');
    this.label.setAttribute('aria-live', 'polite');
    this.track = document.createElement('div');
    this.track.className = 'rice-cooker-progress';
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Progresso do cozimento do arroz');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.fill = document.createElement('div');
    this.fill.className = 'rice-cooker-progress-fill';
    this.track.appendChild(this.fill);
    this.detail = document.createElement('div');
    this.detail.className = 'rice-cooker-detail';
    this.root.append(this.label, this.track, this.detail);
    container.appendChild(this.root);
  }

  update(cooker, camera) {
    const { state } = cooker;
    this.point.set(-0.15, 4.25, 0);
    this.station.model.localToWorld(this.point).project(camera);
    this.root.hidden = this.station.fireState === 'burning' || state === 'EMPTY' || Math.abs(this.point.x) > 1 || Math.abs(this.point.y) > 1;
    this.root.dataset.state = state;
    const x = (this.point.x + 1) * this.container.clientWidth / 2;
    const y = (1 - this.point.y) * this.container.clientHeight / 2;
    this.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    const label = { EMPTY: '', LOADED: 'Arroz cru', COOKING: 'Cozinhando...', READY: '✓ Arroz pronto', BURNT: '! Arroz queimado' }[state];
    if (this.label.textContent !== label) this.label.textContent = label;
    this.track.hidden = state !== 'COOKING';
    this.fill.style.transform = `scaleX(${state === 'COOKING' ? cooker.progress : 0})`;
    const percent = Math.round(cooker.progress * 100);
    if (this.track.getAttribute('aria-valuenow') !== String(percent)) this.track.setAttribute('aria-valuenow', String(percent));
    const detail = state === 'READY' ? `Queima em ${Math.ceil(cooker.burnRemaining)}s`
      : state === 'LOADED' ? 'Aguardando início' : state === 'BURNT' ? 'Descarte na panela' : '';
    if (this.detail.textContent !== detail) this.detail.textContent = detail;
    this.detail.hidden = !detail;
  }

  dispose() { this.root.remove(); }
}
