import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { Station } from './Station.js';

// A single shared tool, separate from food inventories and ingredient factories.
export class FireExtinguisher {
  constructor({ scene, position = [0, 10.15] }) {
    this.station = new Station({ id: 'extinguisher', type: 'extinguisher', position, width: .8, depth: .65, height: 1.1, rotation: Math.PI });
    this.station.behavior = this;
    this.station.interactionReach = 1.65;
    this.station.fireproof = true;
    this.floorStation = new Station({ id: 'extinguisher-floor', type: 'extinguisher', position: [0, 0], width: 1.26, depth: 1.26, height: 1.35 });
    this.floorStation.behavior = this; this.floorStation.fireproof = true; this.floorStation.dynamic = true;
    this.floorStation.interactionEnabled = false; this.floorStation.model.visible = false;
    this.floorStation.collider.dynamicStation = this.floorStation;
    scene.add(this.floorStation.model);
    this.geometries = { box: new BoxGeometry(1, 1, 1), cylinder: new CylinderGeometry(1, 1, 1, 10), sphere: new SphereGeometry(1, 8, 6) };
    this.materials = ['#eb759f', '#fff7ef', '#76596b'].map(color => new MeshStandardMaterial({ color, roughness: .8 }));
    this.model = new Group(); this.model.name = 'kawaii-fire-extinguisher';
    this.model.scale.setScalar(1.5);
    this.mesh(this.model, 'cylinder', 2, [0, .025, 0], [.19, .05, .19]);
    this.mesh(this.model, 'cylinder', 0, [0, .31, 0], [.18, .55, .18]);
    this.mesh(this.model, 'sphere', 0, [0, .57, 0], [.18, .13, .18]);
    this.mesh(this.model, 'box', 1, [0, .32, .18], [.22, .23, .03]);
    this.mesh(this.model, 'box', 0, [0, .32, .2], [.14, .045, .02]);
    this.mesh(this.model, 'box', 0, [0, .32, .2], [.045, .14, .02]);
    this.mesh(this.model, 'box', 2, [0, .72, 0], [.28, .06, .12]);
    for (const x of [-.11, .11]) this.mesh(this.model, 'box', 1, [x, .77, 0], [.045, .13, .07]);
    this.mesh(this.model, 'box', 1, [0, .84, 0], [.26, .04, .07]);
    this.mesh(this.model, 'box', 1, [0, .65, 0], [.11, .1, .1]);
    this.geometries.hose = new TubeGeometry(new CatmullRomCurve3([[.1,.66,0],[.26,.64,.04],[.29,.4,.08],[.24,.46,.22]].map(p => new Vector3(...p))), 12, .035, 6, false);
    const hose = new Mesh(this.geometries.hose, this.materials[2]); this.model.add(hose);
    this.nozzle = new Group(); this.nozzle.name = 'extinguisher-nozzle'; this.nozzle.position.set(.24, .46, .22); this.model.add(this.nozzle);
    this.mesh(this.nozzle, 'cylinder', 2, [0, 0, .03], [.065, .23, .065]).rotation.x = Math.PI / 2;
    this.mesh(this.nozzle, 'cylinder', 1, [0, 0, .15], [.085, .05, .085]).rotation.x = Math.PI / 2;
    this.mesh(this.station.model, 'cylinder', 1, [0, .08, 0], [.39, .16, .31]);
    this.mesh(this.station.model, 'box', 0, [0, .43, -.2], [.22, .75, .12]);
    this.mesh(this.station.model, 'box', 1, [0, .82, 0], [.5, .08, .43]);
    this.mesh(this.station.model, 'box', 0, [0, 1.04, -.23], [.55, .3, .06]);
    this.mesh(this.station.model, 'box', 1, [0, 1.04, -.19], [.25, .05, .02]);
    this.mesh(this.station.model, 'box', 1, [0, 1.04, -.19], [.05, .21, .02]);
    scene.add(this.station.model);
    this.dock();
  }

  mesh(parent, shape, material, position, scale) {
    const mesh = new Mesh(this.geometries[shape], this.materials[material]);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  configureWorld(collisions) { this.collisions = collisions; }
  aimAt(station) {
    const target = station.position.clone(); target.y += station.dimensions.height + .45;
    this.model.updateWorldMatrix(true, true); this.nozzle.lookAt(target);
  }
  resetAim() { this.nozzle.rotation.set(0, 0, 0); }
  get state() { return this.owner ? 'CARRIED' : this.floorStation.interactionEnabled ? 'DROPPED' : 'DOCKED'; }
  result(success, kind, message) { return { success, kind, message }; }

  describe(carry, station = this.station) {
    if (this.owner === carry) return { action: 'Devolver extintor', available: true, showKey: true };
    if (this.owner) return { action: 'Extintor em uso', available: false };
    if (station === this.station && this.state === 'DROPPED') return { action: 'Extintor no chão da cozinha', available: false };
    if (carry.carriedIngredient || carry.carriedTool) return { action: 'Libere as mãos para pegar o extintor', available: false };
    return { action: 'Pegar extintor', available: true, showKey: true };
  }

  interact(carry, station = this.station) {
    if (this.disposed) return this.result(false, 'unavailable', 'Extintor indisponível.');
    if (this.owner === carry) {
      if (carry.player.extinguishing) return this.result(false, 'unavailable', 'Solte a tecla antes de devolver.');
      this.dock(); return this.result(true, 'return-extinguisher', 'Extintor devolvido ao suporte.');
    }
    if ((station === this.station && this.state === 'DROPPED') || (station === this.floorStation && this.state !== 'DROPPED')) return this.result(false, 'unavailable', 'Pegue o extintor onde ele foi deixado.');
    if (this.owner || carry.carriedIngredient || carry.carriedTool) return this.result(false, 'unavailable', 'Libere as mãos ou aguarde o extintor.');
    this.owner = carry; carry.carriedTool = this;
    this.floorStation.interactionEnabled = false; this.floorStation.model.visible = false;
    this.collisions?.removeObstacle(this.floorStation.id);
    this.model.removeFromParent(); this.model.position.set(-.08, -.12, 0); this.model.rotation.set(0, 0, 0);
    carry.player.carryAnchor.position.z = .96;
    carry.player.carryAnchor.add(this.model); carry.player.gesture?.(.3);
    return this.result(true, 'pickup-extinguisher', `Extintor equipado: segure a interação para apagar; ${carry.player.id === 'p2' ? 'O' : 'Q'} deixa no chão.`);
  }

  dock() {
    this.resetAim();
    if (this.owner) { this.owner.player.endExtinguishing?.(); this.owner.carriedTool = null; }
    this.owner = null;
    this.floorStation.interactionEnabled = false; this.floorStation.model.visible = false;
    this.collisions?.removeObstacle(this.floorStation.id);
    this.model.removeFromParent(); this.model.position.set(0, .86, 0); this.model.rotation.set(0, 0, 0);
    this.station.model.add(this.model);
  }

  drop(carry) {
    if (this.owner !== carry || !this.collisions || carry.player.cutAction || carry.player.dashRemaining > 0) return this.result(false, 'unavailable', 'Não é possível deixar o extintor agora.');
    const p = carry.player.group.position, bounds = this.collisions.bounds, radius = .63;
    let chosen = null;
    for (const distance of [1.4, 1.6, 1.25]) {
      for (const offset of [0, .6, -.6, 1.2, -1.2, Math.PI]) {
        const angle = carry.player.group.rotation.y + offset;
        const point = new Vector3(p.x + Math.sin(angle) * distance, 0, p.z + Math.cos(angle) * distance);
        if (point.x - radius < bounds.minX || point.x + radius > bounds.maxX || point.z - radius < bounds.minZ || point.z + radius > bounds.maxZ) continue;
        if ([...this.collisions.obstacles.values()].some(b => point.x > b.minX - radius && point.x < b.maxX + radius && point.z > b.minZ - radius && point.z < b.maxZ + radius)) continue;
        if (this.collisions.players.some(player => point.distanceTo(player.group.position) < radius + player.collider.radius + .05)) continue;
        if (!this.collisions.hasLineOfSight(p, point)) continue;
        chosen = point; break;
      }
      if (chosen) break;
    }
    if (!chosen) return this.result(false, 'unavailable', 'Não há espaço livre perto de você para o extintor.');
    this.resetAim();
    carry.player.endExtinguishing?.(); carry.carriedTool = null; this.owner = null;
    this.floorStation.position.copy(chosen); this.floorStation.model.rotation.set(0, 0, 0);
    const b = this.floorStation.collider.bounds;
    Object.assign(b, { minX: chosen.x - radius, maxX: chosen.x + radius, minZ: chosen.z - radius, maxZ: chosen.z + radius });
    this.floorStation.collider.position.x = chosen.x; this.floorStation.collider.position.z = chosen.z;
    this.floorStation.interactionEnabled = true; this.floorStation.model.visible = true;
    this.model.removeFromParent(); this.model.position.set(0, 0, 0); this.model.rotation.set(0, 0, 0);
    this.floorStation.model.add(this.model); this.collisions.registerObstacle(this.floorStation.collider);
    this.floorStation.model.updateWorldMatrix(true, true);
    return this.result(true, 'drop-extinguisher', 'Extintor deixado no chão. Qualquer jogador pode pegá-lo.');
  }

  dispose() {
    if (this.disposed) return;
    this.dock(); this.disposed = true; this.station.model.removeFromParent();
    this.floorStation.model.removeFromParent();
    Object.values(this.geometries).forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.station.behavior = null;
  }
}
