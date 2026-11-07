export class SessionState {
  constructor(onChange = () => {}) { this.mode = 'MENU'; this.controlsOrigin = 'MENU'; this.onChange = onChange; }
  get paused() { return this.mode !== 'PLAYING'; }
  openRecipeBook() {
    if (this.mode === 'RECIPE_BOOK') return;
    this.recipeBookOrigin = this.mode; this.set('RECIPE_BOOK');
  }
  closeRecipeBook() { if (this.mode === 'RECIPE_BOOK') this.set(this.recipeBookOrigin ?? 'PAUSED'); }
  set(mode) { if (mode !== this.mode) { this.mode = mode; this.onChange(this); } }
  play() { this.set('PLAYING'); }
  pause() { if (this.mode === 'PLAYING') this.set('PAUSED'); }
  settings() { this.settingsOrigin = this.mode === 'MENU' ? 'MENU' : 'PAUSED'; this.set('SETTINGS'); }
  controls() { this.controlsOrigin = this.mode === 'SETTINGS' ? 'SETTINGS' : this.mode === 'MENU' ? 'MENU' : 'PAUSED'; this.set('CONTROLS'); }
  confirmMenu() { if (this.mode === 'PAUSED') this.set('CONFIRM'); }
  back() { this.set(this.mode === 'CONTROLS' ? this.controlsOrigin : this.mode === 'SETTINGS' ? this.settingsOrigin : 'PAUSED'); }
  escape() {
    if (this.mode === 'PLAYING') this.pause();
    else if (this.mode === 'PAUSED') this.play();
    else if (this.mode === 'CONTROLS' || this.mode === 'CONFIRM' || this.mode === 'SETTINGS') this.back();
  }
}
