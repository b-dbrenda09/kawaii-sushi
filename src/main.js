import './styles/style.css';
import { Game } from './game/Game.js';

let game;
const container = document.querySelector('#app');
function showMenu() {
  game?.dispose(); game = null;
  container.replaceChildren();
  const menu = document.createElement('main'); menu.className = 'mode-menu';
  menu.innerHTML = '<section class="mode-panel"><div class="mode-decoration" aria-hidden="true">🎀 🍣 🎀</div><p class="mode-eyebrow">Uma cozinha, muitas delícias</p><h1>HELLO KITTY SUSHI</h1><p class="mode-subtitle">Escolha como deseja jogar!</p><div class="mode-options"><button type="button" data-mode="solo"><strong>JOGAR SOZINHO</strong><span>Hello Kitty · 1 pessoa</span><small>WASD ou setas · E · Espaço · R</small></button><button type="button" data-mode="coop"><strong>JOGAR EM DUPLA</strong><span>Hello Kitty + Dear Daniel · 2 pessoas</span><small>P1: WASD · E · Espaço · R<br>P2: setas · P · Shift direito · Ctrl direito</small></button></div><p class="mode-footer">3 minutos para preparar sushis com carinho.<br>Esc pausa · Livro de receitas disponível na cozinha</p></section>';
  menu.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
    menu.remove();
    try {
      game = new Game(container, { gameMode: button.dataset.mode, onMainMenu: showMenu });
      game.start();
    } catch (error) { game?.dispose(); console.error('Não foi possível inicializar Hello Kitty Sushi:', error); showMenu(); }
  });
  container.append(menu); menu.querySelector('button').focus();
}
showMenu();
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
window.addEventListener('pagehide', () => game?.dispose(), { once: true });
