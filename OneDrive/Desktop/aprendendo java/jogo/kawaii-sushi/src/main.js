import './styles/style.css';
import { Game } from './game/Game.js';

let game;

try {
  game = new Game(document.querySelector('#app'));
  game.start();
} catch (error) {
  game?.dispose();
  console.error('Não foi possível inicializar Kawaii Sushi:', error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.dispose());
}

window.addEventListener('pagehide', () => game?.dispose(), { once: true });
