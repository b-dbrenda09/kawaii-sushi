import './styles/style.css';
import { Game } from './game/Game.js';

let game;
function launch() {
  game?.dispose();
  game = new Game(document.querySelector('#app'), { onMainMenu: launch });
  game.start();
}
try { launch(); } catch (error) { game?.dispose(); console.error('Não foi possível inicializar Kawaii Sushi:', error); }
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
window.addEventListener('pagehide', () => game?.dispose(), { once: true });
