import { RiceCookerSystem } from './RiceCookerSystem.js';
import { RiceCookerEffects } from './RiceCookerEffects.js';
import { RiceCookerUI } from './RiceCookerUI.js';
import { CuttingSystem } from './CuttingSystem.js';
import { CuttingEffects } from './CuttingEffects.js';
import { CuttingUI } from './CuttingUI.js';
import { AssemblySystem } from './AssemblySystem.js';
import { AssemblyUI } from './AssemblyUI.js';

// Cada estação possui um sistema; o personagem é recebido pelo contexto de interação.
export class PreparationSystem {
  constructor({ stations, carrySystem, factory, sushiFactory, sound = null, container = null }) {
    this.riceCookers = new Map(); this.cuttingSystems = new Map(); this.assemblySystems = new Map();
    this.riceUIs = new Map(); this.cuttingUIs = new Map();
    this.carrySystem = carrySystem;
    for (const station of stations.values()) {
      if (station.type === 'riceCooker') {
        this.riceCookers.set(station.id, new RiceCookerSystem({ station, carrySystem, factory, effects: new RiceCookerEffects(station) }));
        if (container) this.riceUIs.set(station.id, new RiceCookerUI(container, station));
      } else if (station.type === 'cutting') {
        this.cuttingSystems.set(station.id, new CuttingSystem({ station, carrySystem, player: carrySystem.player, factory,
          effects: new CuttingEffects(station), sound }));
        if (container) this.cuttingUIs.set(station.id, new CuttingUI(container, station));
      } else if (station.type === 'assembly') {
        this.assemblySystems.set(station.id, new AssemblySystem({ station, carrySystem, factory: sushiFactory }));
      }
    }
    if (container) this.assemblyUI = new AssemblyUI(container);
  }

  get isCutting() { return [...this.cuttingSystems.values()].some(system => system.isCutting && system.player === this.carrySystem.player); }
  updatePreparation(dt) {
    for (const system of this.riceCookers.values()) system.update(dt);
    for (const system of this.cuttingSystems.values()) system.update(dt);
  }
  updateAssembly(dt, { selectedStation = null, cancelHeld = false, disabled = false } = {}) {
    for (const system of this.assemblySystems.values()) system.update(dt, { selected: selectedStation === system.station, cancelHeld, disabled });
  }
  updateUI(camera, selectedStation) {
    for (const [id, ui] of this.riceUIs) ui.update(this.riceCookers.get(id), camera);
    for (const [id, ui] of this.cuttingUIs) ui.update(this.cuttingSystems.get(id), camera);
    const selected = this.assemblySystems.get(selectedStation?.id);
    this.assemblyUI?.update(selected ?? this.assemblySystems.values().next().value, Boolean(selected));
  }
  cancelCuts() { for (const system of this.cuttingSystems.values()) system.cancelStroke(); }
  resetCancellation() { for (const system of this.assemblySystems.values()) system.resetCancellation(); }
  dispose() {
    for (const map of [this.riceUIs, this.cuttingUIs, this.riceCookers, this.cuttingSystems, this.assemblySystems]) {
      for (const item of map.values()) item.dispose(); map.clear();
    }
    this.assemblyUI?.dispose();
  }
}
