import './styles/style.css';
import { Game } from './game/Game.js';
import { CUSTOM_ASSETS } from './config/CustomAssets.js';
import { browserStorage, gameSettings } from './config/GameSettings.js';
import { ControlSettings } from './game/ControlSettings.js';
import { OptionsUI } from './game/OptionsUI.js';
import { SoundSystem } from './game/SoundSystem.js';

let game, optionsUI, menuSound;
const controlSettings = new ControlSettings({ storage: browserStorage() });
const unsubscribeSettings = gameSettings.subscribe(values => {
  document.documentElement.dataset.menuDecorations = String(values.menuDecorations);
});
const container = document.querySelector('#app');
function showMenu() {
  game?.dispose(); game = null;
  optionsUI?.dispose(); menuSound?.dispose();
  menuSound = new SoundSystem();
  container.replaceChildren();
  const menu = document.createElement('main'); menu.className = 'mode-menu';
  menu.innerHTML = '<section class="mode-panel"><div class="mode-decoration" aria-hidden="true">🎀 🍣 🎀</div><p class="mode-eyebrow">Uma cozinha, muitas delícias</p><h1 class="mode-brand"><span>HELLO KITTY SUSHI</span></h1><p class="mode-subtitle">Escolha como deseja jogar!</p><div class="mode-options"><button type="button" data-mode="solo"><strong>JOGAR SOZINHO</strong></button><button type="button" data-mode="coop"><strong>JOGAR EM DUPLA</strong></button><button type="button" data-action="options" aria-expanded="false" aria-controls="menu-options"><strong>OPÇÕES</strong></button></div><p class="mode-footer">5 minutos para preparar sushis com carinho.<br>Esc pausa · Livro de receitas disponível na cozinha</p></section>';
  menu.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
    optionsUI?.dispose(); menuSound?.dispose();
    menu.remove();
    try {
      game = new Game(container, { gameMode: button.dataset.mode, onMainMenu: showMenu, controlSettings });
      game.start();
    } catch (error) { game?.dispose(); console.error('Não foi possível inicializar Hello Kitty Sushi:', error); showMenu(); }
  });
  const brand = menu.querySelector('.mode-brand');
  const fallback = brand.querySelector('span');
  const logo = document.createElement('img');
  logo.className = 'custom-asset custom-asset-menuLogo';
  logo.alt = 'Hello Kitty Sushi';
  logo.width = 1600;
  logo.height = 793;
  logo.onerror = () => {
    logo.remove();
    fallback.hidden = false;
  };
  fallback.hidden = true;
  brand.prepend(logo);
  logo.src = CUSTOM_ASSETS.menuLogo;
  optionsUI = new OptionsUI(menu, { trigger: menu.querySelector('[data-action="options"]'), controlSettings, sound: menuSound });
  optionsUI.root.id = 'menu-options';
  container.append(menu); menu.querySelector('button').focus();
}
showMenu();
function dispose() { game?.dispose(); optionsUI?.dispose(); menuSound?.dispose(); unsubscribeSettings(); }
if (import.meta.hot) import.meta.hot.dispose(() => { dispose(); window.removeEventListener('pagehide', dispose); });
window.addEventListener('pagehide', dispose, { once: true });
