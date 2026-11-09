import { CONTROL_OPTIONS, ControlSettings } from './ControlSettings.js';
const CONTROLS = [
  ['MOVIMENTAÇÃO', 'W: fundo da cozinha.', 'A: esquerda da cozinha.', 'S: frente da cozinha.', 'D: direita da cozinha.', 'Setas: movimentação alternativa.'],
  ['AÇÕES', 'Space: correr/dash.', 'E: interagir, pegar ou colocar ingredientes.', 'E repetidamente: cortar ingredientes.', 'R segurado por um segundo: cancelar montagem.', 'ESC: pausar ou voltar.'],
];

export class PauseUI {
  constructor(container, session, onMainMenu, settings = new ControlSettings()) {
    this.settings = settings;
    this.session = session; this.onMainMenu = onMainMenu;
    const document = container.ownerDocument;
    this.document = document;
    this.root = document.createElement('div'); this.root.className = 'pause-overlay';
    this.panel = document.createElement('section'); this.panel.className = 'pause-panel';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'pause-title'); this.root.appendChild(this.panel); container.appendChild(this.root);
    this.onKeyDown = (event) => {
      if (session.mode === 'RECIPE_BOOK' || session.mode === 'FINISHED') return;
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
    if (mode === 'RECIPE_BOOK' || mode === 'FINISHED') { this.root.hidden = true; this.root.onanimationend = null; return; }
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
    title.textContent = mode === 'MENU' ? 'Kawaii Sushi' : mode === 'CONTROLS' ? 'Controles' : mode === 'SETTINGS' ? 'Configurações' : mode === 'CONFIRM' ? 'Menu principal' : 'Jogo Pausado';
    this.panel.appendChild(title);
    const button = (label, action, id) => {
      const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.dataset.action = id; element.addEventListener('click', action); this.panel.appendChild(element);
    };
    if (mode === 'MENU') {
      const description = document.createElement('p'); description.textContent = 'Uma cozinha fofinha, um sushi de cada vez.'; this.panel.appendChild(description);
      button('Jogar', () => this.session.play(), 'play');
      button('Configurações', () => this.session.settings(), 'settings');
      button('Ver controles', () => this.session.controls(), 'controls');
    } else if (mode === 'PAUSED') {
      button('Continuar jogo', () => this.session.play(), 'resume');
      button('Configurações', () => this.session.settings(), 'settings');
      button('Ver controles', () => this.session.controls(), 'controls');
      button('Menu principal', () => this.session.confirmMenu(), 'main-menu');
    } else if (mode === 'SETTINGS') {
      button('Controles', () => this.session.controls(), 'controls');
      button('Voltar', () => this.session.back(), 'back');
    } else if (mode === 'CONTROLS') {
      const heading = document.createElement('h2'); heading.textContent = 'Modo de movimentação'; this.panel.append(heading);
      const options = document.createElement('div'); options.className = 'movement-options';
      options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Modo de movimentação');
      for (const option of CONTROL_OPTIONS) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.dataset.movementMode = option.id;
        choice.setAttribute('aria-pressed', String(this.settings.movementMode === option.id));
        const label = document.createElement('strong'); label.textContent = option.label.replace('Relativa', 'Relativo');
        const help = document.createElement('span'); help.textContent = option.description;
        choice.append(label, help); choice.onclick = () => {
          this.settings.setMovementMode(option.id);
          options.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === choice)));
        };
        options.append(choice);
      }
      this.panel.append(options);
      const facing = document.createElement('p'); facing.textContent = 'No modo personagem: Q gira à esquerda e F à direita. WASD e setas movimentam; a orientação é mantida no strafe e na marcha à ré.';
      this.panel.append(facing);
      for (const [heading, ...lines] of CONTROLS) {
        if (heading === 'MOVIMENTAÇÃO') continue;
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
