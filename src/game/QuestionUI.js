import { mountCustomAsset } from '../config/CustomAssets.js';

export class QuestionUI {
  constructor(container, system, { gameMode = 'solo', onClose = () => {} } = {}) {
    this.system = system; this.gameMode = gameMode;
    this.onClose = onClose;
    const doc = container.ownerDocument; this.doc = doc;
    this.root = doc.createElement('div'); this.root.className = 'question-overlay'; this.root.hidden = true;
    this.root.innerHTML = '<section class="question-panel" role="dialog" aria-modal="true" aria-labelledby="question-title" aria-describedby="question-owner question-prompt"><div class="question-ribbon" aria-hidden="true">🎀 🍣 🎀</div><p id="question-owner" class="question-owner"></p><h1 id="question-title">Desafio da entrega!</h1><p class="question-demo">Demonstração · tema a definir</p><div class="question-form"><p id="question-prompt"></p><div class="question-options" role="radiogroup" aria-label="Alternativas"></div><p class="question-controls"></p><button class="question-confirm" type="button" disabled>Confirmar resposta</button></div><div class="question-result" role="status" aria-live="assertive" hidden><h2></h2><p class="question-result-detail"></p><p class="question-explanation"></p><button class="question-confirm question-continue" type="button" disabled>Continuar</button></div></section>';
    this.panel = this.root.querySelector('section'); this.owner = this.root.querySelector('.question-owner');
    mountCustomAsset(this.panel, 'questionLogo', { fallback: this.root.querySelector('.question-ribbon'), alt: 'Logo das perguntas' });
    this.prompt = this.root.querySelector('#question-prompt'); this.form = this.root.querySelector('.question-form');
    this.options = Array.from({ length: 4 }, (_, index) => {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'question-option';
      button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', 'false'); button.dataset.answer = index;
      button.onclick = () => { if (system.active) system.select(index, system.active.playerId); };
      this.root.querySelector('.question-options').append(button); return button;
    });
    this.confirm = this.root.querySelector('.question-confirm');
    this.confirm.onclick = () => { if (system.active) system.confirm(system.active.playerId); };
    this.result = this.root.querySelector('.question-result');
    this.continueButton = this.root.querySelector('.question-continue');
    this.continueButton.onclick = () => { if (system.active) system.continue(system.active.playerId); };
    container.append(this.root);
    system.onChange = active => this.render(active);
    // Capture keys before gameplay, pause-menu and browser button shortcuts can handle them.
    this.onKeyDown = event => {
      const active = system.active; if (!active || this.root.hidden) return;
      event.stopImmediatePropagation();
      if (event.code === 'Tab') {
        event.preventDefault();
        const buttons = [...this.panel.querySelectorAll('button:not(:disabled)')].filter(b => !b.closest('[hidden]'));
        if (!buttons.length) return;
        const index = buttons.indexOf(doc.activeElement), next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus(); return;
      }
      event.preventDefault();
      if (event.repeat) return;
      const p2 = active.playerId === 'p2';
      if (active.phase === 'RESULT') {
        if ([p2 ? 'KeyP' : 'KeyE', 'Enter', 'NumpadEnter', 'Space'].includes(event.code)) system.continue(active.playerId);
        return;
      }
      if (active.phase !== 'QUESTION') return;
      const controls = p2 ? ['ArrowUp', 'ArrowDown'] : this.gameMode === 'solo' ? ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'] : ['KeyW', 'KeyS'];
      if (controls.includes(event.code)) {
        const delta = ['KeyW', 'ArrowUp'].includes(event.code) ? -1 : 1;
        const index = active.selectedIndex === null ? (delta > 0 ? 0 : 3) : (active.selectedIndex + delta + 4) % 4;
        system.select(index, active.playerId); this.options[index].focus();
      } else if (event.code === (p2 ? 'KeyP' : 'KeyE') || event.code === 'Enter' || event.code === 'NumpadEnter') system.confirm(active.playerId);
    };
    doc.defaultView.addEventListener('keydown', this.onKeyDown, true);
    this.render(null);
  }
  render(active) {
    this.root.hidden = !active; if (!active) { if (this.id) this.onClose(); this.id = null; return; }
    const newlyOpened = this.id !== active.id; this.id = active.id;
    this.root.dataset.player = active.playerId; this.root.dataset.phase = active.phase;
    this.owner.textContent = active.playerId === 'p2' ? 'P2 · Dear Daniel responde' : this.gameMode === 'coop' ? 'P1 · Hello Kitty responde' : 'Hello Kitty responde';
    this.root.querySelector('.question-demo').textContent = `${active.question.tema} · ${{ facil: 'Fácil', media: 'Média', dificil: 'Difícil' }[active.question.dificuldade]}`;
    const result = active.phase === 'RESULT';
    this.form.hidden = false; this.confirm.hidden = result; this.result.hidden = !result;
    this.root.querySelector('.question-controls').hidden = result;
    this.prompt.textContent = active.question.enunciado;
    this.options.forEach((option, index) => {
      option.textContent = `${'ABCD'[index]}) ${active.question.alternativas[index]}`;
      option.disabled = active.phase !== 'QUESTION';
      option.setAttribute('aria-checked', String(active.selectedIndex === index));
      option.dataset.result = result ? index === active.question.respostaCorreta ? 'correct' : index === active.selectedIndex ? 'incorrect' : 'neutral' : '';
      option.setAttribute('aria-label', `${option.textContent}${result && index === active.question.respostaCorreta ? ' — Resposta correta' : result && index === active.selectedIndex ? ' — Sua resposta incorreta' : ''}`);
    });
    if (result) {
      const correct = active.result.correct;
      this.result.dataset.correct = String(correct);
      this.result.querySelector('h2').textContent = correct === true ? 'Resposta correta!' : correct === false ? 'Resposta incorreta!' : 'Entrega indisponível';
      this.result.querySelector('.question-result-detail').textContent = correct === true ? '+50 pontos extras!' : correct === false ? 'Prato perdido! -50 pontos!' : active.result.message;
      this.result.querySelector('.question-explanation').textContent = active.question.explicacao ?? '';
      this.continueButton.disabled = !active.canContinue;
      this.continueButton.textContent = active.canContinue ? 'Continuar' : `Continuar (aguarde ${correct === true ? 3 : 5}s)`;
      if (this.root.dataset.resultId !== active.id) {
        this.root.dataset.resultId = active.id; this.result.tabIndex = -1; this.result.focus({ preventScroll: true });
      }
      return;
    }
    this.confirm.disabled = active.selectedIndex === null || active.phase !== 'QUESTION';
    this.root.querySelector('.question-controls').textContent = active.playerId === 'p2' ? 'P2: ↑/↓ para escolher · P ou Enter para confirmar' : 'W/S para escolher · E ou Enter para confirmar';
    if (newlyOpened) this.options[0].focus({ preventScroll: true });
  }
  dispose() { this.doc.defaultView.removeEventListener('keydown', this.onKeyDown, true); this.system.onChange = () => {}; this.root.remove(); }
}
