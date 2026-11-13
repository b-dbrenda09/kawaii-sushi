import { CONTROL_OPTIONS, ControlSettings, MOVEMENT_MODES } from './ControlSettings.js';
import { CAMERA_CONFIG } from './CameraConfig.js';
const CONTROLS = [
  ['MOVIMENTAÇÃO', 'W: fundo da cozinha.', 'A: esquerda da cozinha.', 'S: frente da cozinha.', 'D: direita da cozinha.', 'Setas: movimentação alternativa.'],
  ['AÇÕES', 'Space: correr/dash.', 'E: interagir, pegar ou colocar ingredientes.', 'E repetidamente: cortar ingredientes.', 'Extintor: segure E para apagar em até 2 segundos; Q deixa no chão.', 'R segurado por um segundo: cancelar montagem.', 'ESC: pausar ou voltar.'],
];

export class PauseUI {
  constructor(container, session, onMainMenu, settings = new ControlSettings(), gameMode = 'solo', canChangeMovement = () => true, camera = null) {
    this.camera = camera;
    this.settings = settings; this.gameMode = gameMode;
    this.canChangeMovement = canChangeMovement;
    this.session = session; this.onMainMenu = onMainMenu;
    const document = container.ownerDocument;
    this.document = document;
    this.root = document.createElement('div'); this.root.className = 'pause-overlay';
    this.panel = document.createElement('section'); this.panel.className = 'pause-panel';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'pause-title'); this.root.appendChild(this.panel); container.appendChild(this.root);
    this.onKeyDown = (event) => {
      if (session.mode === 'RECIPE_BOOK' || session.mode === 'FINISHED' || session.mode === 'QUESTION') return;
      if (event.code === 'Escape') {
        event.preventDefault(); if (!event.repeat) session.escape();
      }
      if (session.paused && event.code === 'Space' && event.target?.tagName !== 'BUTTON') event.preventDefault();
      if (session.paused && event.code === 'Tab') {
        const buttons = [...this.panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
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
    if (mode === 'RECIPE_BOOK' || mode === 'FINISHED' || mode === 'QUESTION') { this.root.hidden = true; this.root.onanimationend = null; return; }
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
    if (mode !== 'MENU') {
      const brand = document.createElement('p'); brand.className = 'restaurant-brand'; brand.textContent = 'Hello Kitty Sushi'; this.panel.appendChild(brand);
    }
    const title = document.createElement('h1'); title.id = 'pause-title';
    title.textContent = mode === 'MENU' ? 'Hello Kitty Sushi' : mode === 'CONTROLS' ? 'Controles' : mode === 'SETTINGS' ? 'Configurações' : mode === 'CONFIRM' ? 'Menu principal' : 'Jogo Pausado';
    this.panel.appendChild(title);
    const button = (label, action, id) => {
      const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.dataset.action = id; element.addEventListener('click', action); this.panel.appendChild(element);
    };
    if (mode === 'MENU') {
      const movement = this.settings.movementMode === MOVEMENT_MODES.GPS ? 'aponte o mouse e segure W' : this.gameMode === 'coop' ? 'WASD' : 'WASD ou setas';
      const description = document.createElement('p'); description.textContent = this.gameMode === 'coop' ? 'P1 Hello Kitty: ' + movement + ' · E · Espaço · R. P2 Dear Daniel: setas · P · Shift direito · Ctrl direito. Pedidos e pontuação compartilhados.' : 'Hello Kitty: ' + movement + ' · E para interagir · Espaço para dash · R para cancelar montagem.'; this.panel.appendChild(description);
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
      if (this.camera) {
        const heading = document.createElement('h2'); heading.textContent = 'Câmera frontal elevada'; this.panel.append(heading);
        const refresh = [];
        for (const [key, label, min, max, step, factor, suffix] of [
          ['inclination', 'Inclinação', CAMERA_CONFIG.minInclination, CAMERA_CONFIG.maxInclination, 1, 1, '°'],
          ['zoom', 'Zoom', CAMERA_CONFIG.minZoom * 100, CAMERA_CONFIG.maxZoom * 100, 1, 100, '%'],
        ]) {
          const row = document.createElement('label'); row.className = 'camera-setting';
          const text = document.createElement('span'); text.textContent = label;
          const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step;
          input.dataset.cameraSetting = key; input.setAttribute('aria-label', label);
          const output = document.createElement('output');
          const update = () => { input.value = Math.round(this.camera.settings[key] * factor); output.textContent = `${input.value}${suffix}`; };
          input.oninput = () => { this.camera.configure({ [key]: Number(input.value) / factor }); update(); };
          refresh.push(update); update(); row.append(text, input, output); this.panel.append(row);
        }
        button('Restaurar câmera', () => {
          this.camera.configure({ inclination: CAMERA_CONFIG.inclination, zoom: CAMERA_CONFIG.zoom });
          refresh.forEach(update => update());
        }, 'reset-camera');
      }
      button('Voltar', () => this.session.back(), 'back');
    } else if (mode === 'CONTROLS') {
      const heading = document.createElement('h2'); heading.textContent = 'Modo de movimentação'; this.panel.append(heading);
      const options = document.createElement('div'); options.className = 'movement-options';
      const canChangeMovement = this.canChangeMovement();
      options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Modo de movimentação');
      for (const option of CONTROL_OPTIONS) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.dataset.movementMode = option.id;
        choice.disabled = !canChangeMovement;
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
      if (!canChangeMovement) {
        const help = document.createElement('p');
        help.textContent = 'Conclua a ação de preparo para trocar o modo de movimentação.';
        this.panel.append(help);
      }
      const facing = document.createElement('p'); facing.textContent = this.gameMode === 'coop' ? 'P2 usa as setas em todos os modos. No modo personagem, esquerda/direita giram e cima/baixo avançam e recuam.' : 'No modo personagem: A/D ou setas esquerda/direita giram; W/S ou setas cima/baixo avançam e recuam.';
      this.panel.append(facing);
      for (const [heading, ...lines] of (this.gameMode === 'coop' ? [['AÇÕES', 'P1: E para interagir, Espaço para dash, R para cancelar.', 'P2: P para interagir, Shift direito para dash, Ctrl direito para cancelar.', 'Extintor: segure E (P1) ou P (P2), por até 2 segundos. Q (P1) / O (P2) deixam no chão.', 'ESC: pausar os dois jogadores.']] : CONTROLS)) {
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
