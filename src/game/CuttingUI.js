import { Vector3 } from 'three';

export class CuttingUI {
  constructor(container, station) {
    this.container = container;
    this.station = station;
    this.point = new Vector3();
    const document = container.ownerDocument;
    this.root = document.createElement('div');
    this.root.className = 'cutting-status'; this.root.hidden = true;
    this.label = document.createElement('div');
    this.label.setAttribute('role', 'status'); this.label.setAttribute('aria-live', 'polite');
    this.track = document.createElement('div'); this.track.className = 'cutting-progress';
    this.track.setAttribute('role', 'progressbar'); this.track.setAttribute('aria-label', 'Progresso do corte');
    this.track.setAttribute('aria-valuemin', '0'); this.track.setAttribute('aria-valuemax', '100');
    this.fill = document.createElement('div'); this.fill.className = 'cutting-progress-fill';
    this.track.appendChild(this.fill);
    this.detail = document.createElement('div'); this.detail.className = 'cutting-detail';
    this.root.append(this.label, this.track, this.detail); container.appendChild(this.root);
  }

  update(cutting, camera) {
    this.point.copy(cutting.boardAnchor.position).setY(4.25);
    this.station.model.localToWorld(this.point).project(camera);
    this.root.hidden = cutting.state === 'EMPTY' || Math.abs(this.point.x) > 1 || Math.abs(this.point.y) > 1;
    this.root.dataset.state = cutting.state;
    const x = (this.point.x + 1) * this.container.clientWidth / 2;
    const y = (1 - this.point.y) * this.container.clientHeight / 2;
    this.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    const label = cutting.state === 'READY' ? '✓ Corte concluído' : cutting.isCutting ? 'Cortando...' : 'Cortar';
    if (this.label.textContent !== label) this.label.textContent = label;
    this.track.hidden = cutting.state === 'READY' || cutting.state === 'EMPTY';
    this.fill.style.transform = `scaleX(${cutting.progress})`;
    this.track.setAttribute('aria-valuenow', String(Math.round(cutting.progress * 100)));
    const detail = cutting.state === 'READY' ? 'Pronto para retirar' : `${cutting.cuts} / ${cutting.requiredCuts} cortes`;
    if (this.detail.textContent !== detail) this.detail.textContent = detail;
  }

  dispose() { this.root.remove(); }
}
