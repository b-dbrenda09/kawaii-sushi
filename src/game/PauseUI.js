const CONTROLS = [
  ['MOVIMENTAÇÃO', 'W: fundo da cozinha.', 'A: esquerda da cozinha.', 'S: frente da cozinha.', 'D: direita da cozinha.', 'Setas: movimentação alternativa.'],
  ['AÇÕES', 'Space: correr/dash.', 'E: interagir, pegar ou colocar ingredientes.', 'E repetidamente: cortar ingredientes.', 'R segurado por um segundo: cancelar montagem.', 'ESC: pausar ou voltar.'],
];

export class PauseUI {
  constructor(container, session, onMainMenu) {
    this.session = session; this.onMainMenu = onMainMenu;
    const document = container.ownerDocument;
    this.document = document;
    this.root = document.createElement('div'); this.root.className = 'pause-overlay';
    this.panel = document.createElement('section'); this.panel.className = 'pause-panel';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'pause-title'); this.root.appendChild(this.panel); container.appendChild(this.root);
    this.onKeyDown = (event) => {
      if (event.code === 'Escape') {
        event.preventDefault(); if (!event.repeat) session.escape();
      }
      if (session.paused && event.code === 'Space' && event.target?.tagName !== 'BUTTON') event.preventDefault();
      if (session.paused && event.code === 'Tab') {
        const buttons = [...this.panel.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.defaultView.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  render() {
    const mode = this.session.mode;
    this.root.dataset.mode = mode;
    if (!this.session.paused) {
      this.root.classList.add('is-closing');
      this.root.style.pointerEvents = 'none';
      this.root.onanimationend = () => { if (!this.session.paused) this.root.hidden = true; };
      return;
    }
    this.root.onanimationend = null;
    this.root.classList.remove('is-closing'); this.root.style.pointerEvents = ''; this.root.hidden = false;
    const document = this.document;
    this.panel.replaceChildren();
    const title = document.createElement('h1'); title.id = 'pause-title';
    title.textContent = mode === 'MENU' ? 'Kawaii Sushi' : mode === 'CONTROLS' ? 'Como jogar' : mode === 'CONFIRM' ? 'Menu principal' : 'Jogo Pausado';
    this.panel.appendChild(title);
    const button = (label, action, id) => {
      const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.dataset.action = id; element.addEventListener('click', action); this.panel.appendChild(element);
    };
    if (mode === 'MENU') {
      const description = document.createElement('p'); description.textContent = 'Uma cozinha fofinha, um sushi de cada vez.'; this.panel.appendChild(description);
      button('Jogar', () => this.session.play(), 'play');
      button('Ver controles', () => this.session.controls(), 'controls');
    } else if (mode === 'PAUSED') {
      button('Continuar jogo', () => this.session.play(), 'resume');
      button('Ver controles', () => this.session.controls(), 'controls');
      button('Menu principal', () => this.session.confirmMenu(), 'main-menu');
    } else if (mode === 'CONTROLS') {
      for (const [heading, ...lines] of CONTROLS) {
        const section = document.createElement('div'); section.className = 'controls-section';
        const label = document.createElement('h2'); label.textContent = heading; section.appendChild(label);
        for (const line of lines) { const p = document.createElement('p'); p.textContent = line; section.appendChild(p); }
        this.panel.appendChild(section);
      }
      button('Voltar', () => this.session.back(), 'back');
    } else {
      const text = document.createElement('p'); text.textContent = 'Tem certeza de que deseja voltar ao menu principal? O progresso da partida atual poderá ser perdido.';
      this.panel.appendChild(text);
      button('Cancelar', () => this.session.back(), 'cancel');
      button('Confirmar', this.onMainMenu, 'confirm');
    }
    this.panel.querySelector('button')?.focus({ preventScroll: true });
  }

  dispose() { this.document.defaultView.removeEventListener('keydown', this.onKeyDown); this.root.remove(); }
}
