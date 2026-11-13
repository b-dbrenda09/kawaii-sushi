// Perfis de teclado são adaptadores: a simulação recebe direções e ações.
const wasd = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], interact: 'KeyE', dash: 'Space', cancel: 'KeyR', drop: 'KeyQ' };
const arrows = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], interact: 'KeyP', dash: 'ShiftRight', cancel: 'ControlRight', drop: 'KeyO' };
export const PLAYER_CONTROLS = Object.freeze({
  solo: { ...wasd, up: [...wasd.up, ...arrows.up], down: [...wasd.down, ...arrows.down], left: [...wasd.left, ...arrows.left], right: [...wasd.right, ...arrows.right] },
  p1: wasd, p2: arrows,
});
