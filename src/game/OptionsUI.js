import { gameSettings } from '../config/GameSettings.js';
import { CONTROL_OPTIONS } from './ControlSettings.js';
import { PLAYER_CONTROLS } from './PlayerControls.js';

const keyName = code => ({ Space: 'Espaço', ShiftRight: 'Shift direito', ControlRight: 'Ctrl direito',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code.replace(/^Key/, ''));

export class OptionsUI {
  constructor(menu, { trigger, controlSettings, sound, settings = gameSettings }) {
    this.menu = menu; this.trigger = trigger; this.settings = settings;
    this.document = menu.ownerDocument;
    this.home = menu.querySelector('.mode-panel');
    const doc = this.document;
    this.root = doc.createElement('section'); this.root.className = 'options-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'options-title');
    this.root.innerHTML = '<h1 id="options-title">Opções</h1><p class="options-intro">Deixe tudo do seu jeitinho.</p>';
    const section = title => {
      const fieldset = doc.createElement('fieldset');
      const legend = doc.createElement('legend'); legend.textContent = title;
      fieldset.append(legend); this.root.append(fieldset); return fieldset;
    };
    const audio = section('ÁUDIO');
    for (const [key, title] of [['masterVolume', 'Volume geral'], ['musicVolume', 'Volume da música'], ['effectsVolume', 'Volume dos efeitos sonoros']]) {
      const row = doc.createElement('label'); row.className = 'options-volume';
      const label = doc.createElement('span'); label.textContent = title;
      const input = doc.createElement('input'); input.type = 'range'; input.min = 0; input.max = 100; input.step = 1;
      input.dataset.setting = key; input.setAttribute('aria-label', title); input.id = `options-${key}`;
      const output = doc.createElement('output'); output.htmlFor = input.id;
      input.value = Math.round(settings.values[key] * 100); output.textContent = `${input.value}%`;
      input.oninput = () => {
        sound.unlock(); settings.set(key, Number(input.value) / 100);
        output.textContent = `${input.value}%`;
      };
      input.onchange = () => { if (key !== 'musicVolume') sound.playComplete(); };
      row.append(label, input, output); audio.append(row);
    }
    const musicHelp = doc.createElement('p'); musicHelp.className = 'options-help';
    musicHelp.textContent = 'Música instrumental suave. Em 0%, a trilha fica desligada.'; audio.append(musicHelp);

    const visual = section('VISUAL');
    const decorationRow = doc.createElement('label'); decorationRow.className = 'options-check';
    const decorations = doc.createElement('input'); decorations.type = 'checkbox'; decorations.dataset.setting = 'menuDecorations';
    decorations.checked = settings.values.menuDecorations;
    decorations.onchange = () => settings.set('menuDecorations', decorations.checked);
    decorationRow.append(decorations, doc.createTextNode('Enfeites decorativos do menu'));
    const fullscreen = doc.createElement('button'); fullscreen.type = 'button'; fullscreen.dataset.action = 'fullscreen';
    const status = doc.createElement('p'); status.className = 'options-help'; status.setAttribute('role', 'status');
    this.updateFullscreen = () => {
      const available = Boolean(doc.fullscreenElement ? doc.exitFullscreen : doc.documentElement.requestFullscreen) && doc.fullscreenEnabled !== false;
      fullscreen.disabled = !available;
      fullscreen.textContent = doc.fullscreenElement ? 'Voltar para janela' : 'Ativar tela cheia';
      if (!available) status.textContent = 'Tela cheia indisponível neste navegador.';
    };
    fullscreen.onclick = async () => {
      fullscreen.disabled = true; status.textContent = '';
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else await doc.documentElement.requestFullscreen();
      } catch { status.textContent = 'Não foi possível mudar a tela. Tente novamente.'; }
      finally { this.updateFullscreen(); }
    };
    this.updateFullscreen(); doc.addEventListener('fullscreenchange', this.updateFullscreen);
    visual.append(decorationRow, fullscreen, status);

    const controls = section('CONTROLES');
    for (const [name, profile] of [['Jogador 1 · Hello Kitty', PLAYER_CONTROLS.p1], ['Jogador 2 · Dear Daniel', PLAYER_CONTROLS.p2]]) {
      const heading = doc.createElement('h2'); heading.textContent = name;
      const description = doc.createElement('p');
      const movement = ['up', 'left', 'down', 'right'].map(direction => profile[direction].map(keyName).join('/')).join(' · ');
      description.textContent = `Mover: ${movement}. Interagir: ${keyName(profile.interact)}. Dash: ${keyName(profile.dash)}. Cancelar: ${keyName(profile.cancel)}. Largar extintor: ${keyName(profile.drop)}.`;
      controls.append(heading, description);
    }
    const common = doc.createElement('p'); common.className = 'options-help';
    common.textContent = 'Solo: WASD ou setas. Esc: pausa/voltar. Livro de receitas: botão “Receitas” na HUD, sem atalho de teclado.';
    const movementLabel = doc.createElement('label'); movementLabel.className = 'options-movement'; movementLabel.textContent = 'Modo de movimentação';
    const movement = doc.createElement('select'); movement.dataset.setting = 'movementMode';
    for (const option of CONTROL_OPTIONS) {
      const item = doc.createElement('option'); item.value = option.id; item.textContent = option.label; movement.append(item);
    }
    movement.value = controlSettings.movementMode;
    const movementHelp = doc.createElement('p'); movementHelp.className = 'options-help';
    const updateMovementHelp = () => {
      movementHelp.textContent = `${CONTROL_OPTIONS.find(option => option.id === movement.value).description} Em dupla, P2 usa as setas; o GPS por mouse é do P1.`;
    };
    movement.onchange = () => { controlSettings.setMovementMode(movement.value); updateMovementHelp(); };
    updateMovementHelp(); movementLabel.append(movement); controls.append(common, movementLabel, movementHelp);
    const back = doc.createElement('button'); back.type = 'button'; back.className = 'options-back';
    back.textContent = 'VOLTAR'; back.dataset.action = 'back'; back.onclick = () => this.close(); this.root.append(back);
    menu.append(this.root);
    trigger.onclick = () => this.open();
    this.onKeyDown = event => {
      if (!this.root.hidden && event.code === 'Escape') { event.preventDefault(); this.close(); }
    };
    doc.defaultView.addEventListener('keydown', this.onKeyDown);
  }

  open() {
    this.home.hidden = true; this.root.hidden = false; this.menu.scrollTop = 0;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.root.querySelector('input').focus({ preventScroll: true });
  }

  close() {
    this.root.hidden = true; this.home.hidden = false; this.menu.scrollTop = 0;
    this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.focus({ preventScroll: true });
  }

  dispose() {
    this.document.removeEventListener('fullscreenchange', this.updateFullscreen);
    this.document.defaultView.removeEventListener('keydown', this.onKeyDown);
    this.trigger.onclick = null; this.root.remove();
  }
}
