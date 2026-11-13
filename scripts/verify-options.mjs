import assert from 'node:assert/strict';
import { GameSettings, SETTINGS_KEY } from '../src/config/GameSettings.js';
import { SoundSystem } from '../src/game/SoundSystem.js';

const records = new Map();
const storage = { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) };
const settings = new GameSettings({ storage });
assert.equal(settings.values.musicVolume, 0, 'Não adicionar música automaticamente ao jogo existente');
settings.set('masterVolume', .4); settings.set('effectsVolume', .7); settings.set('musicVolume', .3);
settings.set('menuDecorations', false);
assert.deepEqual(new GameSettings({ storage }).values, settings.values, 'Preferências sobrevivem ao recarregamento');
assert.equal(settings.set('musicVolume', NaN), false);
assert.equal(settings.set('menuDecorations', 'false'), false);
assert.equal(settings.set('unexpected', 1), false);
settings.set('masterVolume', 2); assert.equal(settings.values.masterVolume, 1);
settings.set('masterVolume', -.5); assert.equal(settings.values.masterVolume, 0);
const unavailable = new GameSettings({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
assert.ok(unavailable.set('effectsVolume', .25)); assert.equal(unavailable.values.effectsVolume, .25);
records.set(SETTINGS_KEY, '{broken'); assert.equal(new GameSettings({ storage }).values.masterVolume, 1);
settings.set('masterVolume', .4);

const target = new EventTarget();
const connections = new Map();
let contexts = 0, closed = 0, started = 0;
const parameter = () => ({ value: 1, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect(destination) { connections.set(this, destination); }, disconnect() {} });
target.AudioContext = class {
  constructor() { contexts++; this.currentTime = 0; this.state = 'suspended'; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { closed++; this.state = 'closed'; return Promise.resolve(); }
  createGain() { return { ...node(), gain: parameter() }; }
  createOscillator() { return { ...node(), frequency: parameter(), start() { started++; }, stop() { this.onended?.(); } }; }
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  createBiquadFilter() { return { ...node(), frequency: { value: 0 } }; }
  createBufferSource() { return { ...node(), start() {}, stop() { this.onended?.(); } }; }
  sampleRate = 44100;
};
const sound = new SoundSystem({ target, settings });
assert.equal(contexts, 0, 'Áudio aguarda um gesto do usuário');
target.dispatchEvent(new Event('pointerdown'));
await Promise.resolve();
assert.equal(contexts, 1);
assert.equal(sound.masterGain.gain.value, .4);
assert.equal(sound.effectsGain.gain.value, .7);
assert.equal(sound.musicGain.gain.value, .3);
assert.equal(connections.get(sound.effectsGain), sound.masterGain);
assert.equal(connections.get(sound.musicGain), sound.masterGain);
assert.equal(connections.get(sound.masterGain), sound.context.destination);
assert.ok(started > 0 && sound.musicTimer, 'Volume da música inicia uma trilha real');
assert.equal(sound.playChop(), true);
sound.playExtinguisher();
const sprayGain = [...sound.nodes].find(value => value.gain);
assert.equal(connections.get(sprayGain), sound.effectsGain, 'Extintor também usa o canal de efeitos');
settings.set('effectsVolume', 0); assert.equal(sound.effectsGain.gain.value, 0);
settings.set('musicVolume', 0); assert.equal(sound.musicGain.gain.value, 0); assert.equal(sound.musicTimer, null);
settings.set('musicVolume', .5); assert.ok(sound.musicTimer);
settings.set('masterVolume', 0); assert.equal(sound.masterGain.gain.value, 0); assert.equal(sound.musicTimer, null);
settings.set('masterVolume', .5); assert.ok(sound.musicTimer);
sound.dispose(); sound.dispose();
assert.equal(sound.musicTimer, null); assert.equal(sound.nodes.size, 0); assert.equal(closed, 1);
assert.equal(settings.listeners.size, 0);
target.dispatchEvent(new Event('keydown')); assert.equal(contexts, 1);
console.log('OK: persistência e validação; volumes reais de master/música/efeitos; trilha opcional; extintor; silêncio e descarte sem timers/listeners restantes.');
