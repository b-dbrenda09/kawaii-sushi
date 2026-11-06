export class SessionState {
  constructor(onChange = () => {}) { this.mode = 'MENU'; this.controlsOrigin = 'MENU'; this.onChange = onChange; }
  get paused() { return this.mode !== 'PLAYING'; }
  set(mode) { if (mode !== this.mode) { this.mode = mode; this.onChange(this); } }
  play() { this.set('PLAYING'); }
  pause() { if (this.mode === 'PLAYING') this.set('PAUSED'); }
  controls() { this.controlsOrigin = this.mode === 'MENU' ? 'MENU' : 'PAUSED'; this.set('CONTROLS'); }
  confirmMenu() { if (this.mode === 'PAUSED') this.set('CONFIRM'); }
  back() { this.set(this.mode === 'CONTROLS' ? this.controlsOrigin : 'PAUSED'); }
  escape() {
    if (this.mode === 'PLAYING') this.pause();
    else if (this.mode === 'PAUSED') this.play();
    else if (this.mode === 'CONTROLS' || this.mode === 'CONFIRM') this.back();
  }
}
