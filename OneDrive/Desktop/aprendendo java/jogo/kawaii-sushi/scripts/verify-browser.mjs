// Verificação opcional com Chrome headless já instalado; nenhuma dependência extra.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(executable, 'Defina CHROME_PATH para um navegador Chromium instalado.');
const profile = await mkdtemp(join(tmpdir(), 'kawaii-sushi-browser-'));
const browser = spawn(executable, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(100); }
  }
  assert.ok(port, 'Navegador deve abrir a porta de depuração.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: process.env.TEST_URL || 'http://127.0.0.1:5173/' });
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await send('Runtime.evaluate', { expression: '!!document.querySelector("canvas")', returnByValue: true });
    if (result.result.value) break;
    await delay(100);
  }
  const output = resolve('artifacts');
  await mkdir(output, { recursive: true });
  for (const [width, height] of [[1280, 800], [375, 812], [812, 375]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(250);
    const result = await send('Runtime.evaluate', {
      expression: `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2');
        resolve({ canvas: !!canvas, webgl: !!gl && !gl.isContextLost(),
          width: canvas?.clientWidth, height: canvas?.clientHeight,
          scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight });
      })))`, awaitPromise: true, returnByValue: true,
    });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    assert.deepEqual(result.result.value, { canvas: true, webgl: true, width, height, scroll: false });
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, `kitchen-${width}x${height}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  // Observa as instâncias reais da aplicação sem expor variáveis de teste no código do jogo.
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const observed = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Usa as URLs carregadas pelo Vite, incluindo os sufixos de atualização HMR.
      const moduleUrl = name => performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/game/' + name + '.js') || '/src/game/' + name + '.js';
      const { Scene } = await import(moduleUrl('Scene'));
      const { Input } = await import(moduleUrl('Input'));
      const originalUpdate = Scene.prototype.update;
      const originalDirection = Input.prototype.getDirection;
      const observed = { events: [] };
      Scene.prototype.update = function (...args) {
        observed.world = this; return originalUpdate.apply(this, args);
      };
      Input.prototype.getDirection = function (...args) {
        observed.input = this; return originalDirection.apply(this, args);
      };
      try {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      } finally {
        Scene.prototype.update = originalUpdate; Input.prototype.getDirection = originalDirection;
      }
      if (!observed.world || !observed.input) throw new Error('Loop principal não observado.');
      observed.origin = observed.world.player.group.position.clone();
      observed.angle = observed.world.player.group.rotation.y;
      observed.cameraPosition = observed.input.camera.position.clone();
      observed.onKey = event => observed.events.push({ code: event.code, prevented: event.defaultPrevented });
      window.addEventListener('keydown', observed.onKey);
      globalThis.__movementTest = observed;
      return true;
    })()`, awaitPromise: true, returnByValue: true,
  });
  assert.equal(observed.exceptionDetails, undefined, JSON.stringify(observed.exceptionDetails));
  assert.equal(observed.result.value, true);
  for (const [code, key, keyCode, axis, sign] of [
    ['KeyW', 'w', 87, 'y', 1], ['ArrowUp', 'ArrowUp', 38, 'y', 1],
    ['KeyS', 's', 83, 'y', -1], ['ArrowDown', 'ArrowDown', 40, 'y', -1],
    ['KeyA', 'a', 65, 'x', -1], ['ArrowLeft', 'ArrowLeft', 37, 'x', -1],
    ['KeyD', 'd', 68, 'x', 1], ['ArrowRight', 'ArrowRight', 39, 'x', 1],
  ]) {
    await send('Runtime.evaluate', { expression: `{
      const t = globalThis.__movementTest;
      t.input.reset(); t.world.player.stopMoving(); t.world.player.group.position.copy(t.origin);
    }` });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: keyCode });
    const moved = await send('Runtime.evaluate', {
      expression: `(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const t = globalThis.__movementTest, player = t.world.player;
        const origin = t.origin.clone().project(t.input.camera);
        const offset = player.group.position.clone().project(t.input.camera).sub(origin);
        return { x: offset.x, y: offset.y, pitch: player.group.rotation.x, roll: player.group.rotation.z,
          height: player.group.position.y, speed: player.velocity.length() };
      })()`, awaitPromise: true, returnByValue: true,
    });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode });
    assert.equal(moved.exceptionDetails, undefined, JSON.stringify(moved.exceptionDetails));
    assert.ok(moved.result.value[axis] * sign > 0, `${code}: deslocamento visual deve corresponder à tecla.`);
    assert.ok(Math.abs(moved.result.value[axis === 'x' ? 'y' : 'x']) < 1e-8);
    assert.equal(moved.result.value.height, 0);
    assert.equal(moved.result.value.pitch, 0);
    assert.equal(moved.result.value.roll, 0);
    assert.ok(moved.result.value.speed > 0 && moved.result.value.speed <= 3.5);
  }
  const focus = await send('Runtime.evaluate', {
    expression: `(async () => {
      const t = globalThis.__movementTest;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true }));
      window.dispatchEvent(new Event('blur'));
      const position = t.world.player.group.position.clone();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = { noKeys: t.input.keys.size === 0, stopped: t.world.player.velocity.length() === 0,
        stable: position.equals(t.world.player.group.position),
        fixedCamera: t.cameraPosition.equals(t.input.camera.position),
        arrowsPrevented: t.events.filter(event => event.code.startsWith('Arrow')).every(event => event.prevented) };
      t.world.player.group.position.copy(t.origin); t.world.player.group.rotation.y = t.angle;
      window.removeEventListener('keydown', t.onKey); delete globalThis.__movementTest;
      return result;
    })()`, awaitPromise: true, returnByValue: true,
  });
  assert.deepEqual(focus.result.value, { noKeys: true, stopped: true, stable: true, fixedCamera: true, arrowsPrevented: true });
  console.log('OK: oito teclas verificadas no loop real, direções visuais, prevenção de rolagem, câmera fixa e perda de foco.');

  // Prancha de inspeção temporária: não altera a câmera nem a interface do jogo.
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
  const preview = await send('Runtime.evaluate', {
    expression: `(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { Player } = await import('/src/game/Player.js');
      const player = new Player({ position: new THREE.Vector3(), rotation: 0 });
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#fce8ef');
      scene.add(player.group, new THREE.AmbientLight('#fff3e5', 2));
      const light = new THREE.DirectionalLight('#fff0d6', 2.5);
      light.position.set(3, 8, 10); scene.add(light);
      const camera = new THREE.OrthographicCamera(-1.9, 1.9, 1.9, -1.9, 0.1, 100);
      camera.position.set(0, 1.5, 8); camera.lookAt(0, 1.5, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(800, 800);
      Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '10' });
      document.body.appendChild(renderer.domElement); renderer.render(scene, camera);
      globalThis.__playerPreview = { player, scene, camera, renderer };
      return true;
    })()`, awaitPromise: true, returnByValue: true,
  });
  assert.equal(preview.exceptionDetails, undefined, JSON.stringify(preview.exceptionDetails));
  assert.equal(preview.result.value, true);
  for (const [name, angle] of [['front', 0], ['three-quarter', Math.PI / 4], ['back', Math.PI]]) {
    await send('Runtime.evaluate', { expression: `{
      const p = globalThis.__playerPreview;
      p.player.group.rotation.y = ${angle}; p.renderer.render(p.scene, p.camera);
    }` });
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, `hello-kitty-${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await send('Runtime.evaluate', { expression: `{
    const p = globalThis.__playerPreview; p.player.dispose(); p.renderer.dispose();
    p.renderer.domElement.remove(); delete globalThis.__playerPreview;
  }` });
  // Exercita inicialização, loop, parada e descarte no WebGL real.
  const lifecycle = await send('Runtime.evaluate', {
    expression: `(async () => {
      const { Game } = await import('/src/game/Game.js');
      const container = document.createElement('div');
      const game = new Game(container);
      game.start(); game.stop(); game.start(); game.dispose(); game.dispose();
      return game.disposed && !game.running && !container.querySelector('canvas');
    })()`, awaitPromise: true, returnByValue: true,
  });
  assert.equal(lifecycle.result.value, true);
  assert.deepEqual(errors, [], `Erros no navegador: ${JSON.stringify(errors)}`);
  console.log('OK: WebGL real, console sem erros, redimensionamento e ciclo de vida. Capturas em artifacts/.');
  await send('Browser.close');
} finally {
  socket?.close();
  if (browser.exitCode === null) {
    await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), delay(2000)]);
    if (browser.exitCode === null) browser.kill();
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
