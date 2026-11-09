export class ResultsUI {
  constructor(container, restart) {
    const doc = container.ownerDocument;
    this.timer = doc.createElement('div'); this.timer.className = 'match-timer'; this.timer.setAttribute('role', 'timer'); this.timer.setAttribute('aria-label', 'Tempo restante');
    this.root = doc.createElement('div'); this.root.className = 'results-overlay'; this.root.hidden = true;
    this.root.innerHTML = '<section class="results-panel" role="dialog" aria-modal="true" aria-labelledby="results-title"><h1 id="results-title">Expediente encerrado!</h1><p class="results-stars"></p><dl></dl><button type="button">Jogar novamente</button></section>';
    this.button = this.root.querySelector('button'); this.button.onclick = restart;
    this.onKey = event => { if (!this.root.hidden && event.code === 'Tab') { event.preventDefault(); this.button.focus(); } };
    doc.defaultView.addEventListener('keydown', this.onKey); this.doc = doc;
    this.hud = doc.createElement('div'); this.hud.className = 'match-hud';
    const score = container.querySelector('.score-hud'), orders = container.querySelector('.order-panel');
    if (score) this.hud.append(score);
    this.hud.append(this.timer);
    if (orders) this.hud.append(orders);
    container.append(this.hud, this.root);
  }
  update(timer) { this.timer.textContent = timer.text; this.timer.dataset.level = timer.level; }
  show(result) {
    const stars = this.root.querySelector('.results-stars'); stars.textContent = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars); stars.setAttribute('aria-label', `${result.stars} de 3 estrelas`);
    const list = this.root.querySelector('dl'); list.replaceChildren();
    for (const [label, value] of [['Pontuação final', result.score], ['Pedidos entregues', result.delivered], ['Pedidos perdidos', result.expired], ['Entregas incorretas', result.incorrect], ['Pedidos gerados', result.generated], ['Melhor sequência', result.bestStreak]]) {
      const dt = this.doc.createElement('dt'), dd = this.doc.createElement('dd'); dt.textContent = label; dd.textContent = value; list.append(dt, dd);
    }
    this.root.hidden = false; this.button.focus({ preventScroll: true });
  }
  dispose() { this.doc.defaultView.removeEventListener('keydown', this.onKey); this.button.onclick = null; this.root.remove(); this.hud.remove(); }
}
