import { BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D,
  PointLight, RingGeometry, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

// Shared geometry, instanced layers, a single trail and at most two unshadowed lights.
export class FireEffects {
  constructor(scene) {
    this.scene = scene; this.records = new Map(); this.sprayers = new Map(); this.phase = 0;
    this.sphere = new SphereGeometry(1, 8, 6); this.flame = new SphereGeometry(1, 10, 8);
    const vertices = this.flame.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const y = vertices.getY(i), taper = y > 0 ? .8 - y * .45 : 1;
      vertices.setXYZ(i, vertices.getX(i) * taper, Math.max(-.7, y), vertices.getZ(i) * taper);
    }
    this.flame.computeVertexNormals();
    this.box = new BoxGeometry(1, 1, 1); this.ring = new RingGeometry(.45, .53, 24);
    this.clock = { value: 0 };
    this.materials = {
      red: this.flameMaterial('#ef5e47', .6), orange: this.flameMaterial('#ff9b37', .84),
      yellow: this.flameMaterial('#fff2a4', .93),
      smoke: new MeshBasicMaterial({ color: '#bfb3c7', transparent: true, opacity: .27, depthWrite: false }),
      white: new MeshBasicMaterial({ color: '#fffaf6', transparent: true, opacity: .68, depthWrite: false }),
      track: new MeshBasicMaterial({ color: '#785b73' }), mint: new MeshBasicMaterial({ color: '#b9f3ce' }),
      ember: new MeshBasicMaterial({ color: '#ffd075', transparent: true, opacity: .8, depthWrite: false }),
      heat: new MeshBasicMaterial({ color: '#ffad69', transparent: true, opacity: .12, depthWrite: false }),
      danger: new MeshBasicMaterial({ color: '#ff962f', transparent: true, opacity: .4, depthWrite: false }),
      route: new MeshBasicMaterial({ color: '#fbb56a', transparent: true, opacity: .35, depthWrite: false }),
    };
    this.lights = Array.from({ length: 2 }, () => {
      const light = new PointLight('#ffb274', 0, 4.5, 2); light.castShadow = false; scene.add(light); return light;
    });
    this.transform = new Object3D(); this.start = new Vector3(); this.end = new Vector3(); this.sample = new Vector3();
  }

  flameMaterial(color, opacity) {
    return new ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uTime: this.clock, uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
      vertexShader: `uniform float uTime; varying float vHeight; varying vec3 vNormal; varying vec3 vView;
        void main() {
          vec3 p=position; float h=clamp((p.y+.7)/1.7,0.,1.);
          float seed=modelMatrix[3].x*1.7+modelMatrix[3].z*2.1;
          #ifdef USE_INSTANCING
            seed+=instanceMatrix[3].x*4.1+instanceMatrix[3].z*3.;
          #endif
          p.x+=h*h*(sin(uTime*4.2+h*5.+seed)*.23+sin(uTime*2.3+seed)*.1);
          p.z+=h*h*cos(uTime*3.4+h*4.+seed)*.18;
          p.xz*=1.+sin(uTime*5.1+h*7.+seed)*.07;
          vec4 local=vec4(p,1.); vec3 n=normal;
          #ifdef USE_INSTANCING
            local=instanceMatrix*local; n=mat3(instanceMatrix)*n;
          #endif
          vec4 view=modelViewMatrix*local;
          vHeight=h; vNormal=normalize(normalMatrix*n); vView=-view.xyz;
          gl_Position=projectionMatrix*view;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vHeight; varying vec3 vNormal; varying vec3 vView;
        void main() {
          float soft=.25+.75*pow(abs(dot(normalize(vNormal),normalize(vView))),.65);
          float tip=1.-smoothstep(.72,1.,vHeight);
          vec3 color=mix(uColor*.82,uColor,clamp(vHeight+.2,0.,1.));
          gl_FragColor=vec4(color,uOpacity*soft*tip);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  pool(parent, material, count, geometry = this.sphere) {
    const mesh = new InstancedMesh(geometry, this.materials[material], count);
    mesh.frustumCulled = false; parent.add(mesh); return mesh;
  }
  matrix(mesh, index, x, y, z, sx, sy, sz) {
    this.transform.position.set(x, y, z); this.transform.scale.set(sx, sy, sz); this.transform.rotation.set(0, 0, 0);
    this.transform.updateMatrix(); mesh.setMatrixAt(index, this.transform.matrix);
  }
  ignite(station) {
    this.remove(station.id);
    const group = new Group(); group.name = `fire-${station.id}`;
    group.position.y = station.localDimensions.height + .04; station.model.add(group);
    const red = this.pool(group, 'red', 3, this.flame), outer = this.pool(group, 'orange', 4, this.flame);
    const inner = this.pool(group, 'yellow', 4, this.flame), smoke = this.pool(group, 'smoke', 3), sparks = this.pool(group, 'ember', 5);
    smoke.material = this.materials.smoke.clone();
    const heat = new Mesh(this.ring, this.materials.heat); heat.rotation.x = -Math.PI / 2; heat.position.y = .02; heat.scale.setScalar(1.3); group.add(heat);
    const meter = new Group(); meter.rotation.y = -station.model.rotation.y; group.add(meter);
    const track = new Mesh(this.box, this.materials.track); track.position.set(0, 1.35, .1); track.scale.set(.95, .07, .22); meter.add(track);
    const fill = new Mesh(this.box, this.materials.mint); fill.position.set(-.46, 1.39, .1); meter.add(fill);
    this.records.set(station.id, { station, group, red, outer, inner, smoke, sparks, heat, track, fill, recovery: null });
  }
  recover(station) {
    const entry = this.records.get(station.id); if (!entry) return;
    entry.recovery = .8; entry.track.visible = false; entry.fill.visible = false;
    const ring = new Mesh(this.ring, this.materials.mint); ring.rotation.x = -Math.PI / 2; ring.position.y = .05;
    entry.group.add(ring); entry.recoveryRing = ring;
  }
  setPropagation(pending) {
    if (this.trail?.pending === pending) return;
    if (this.trail) {
      this.releaseGroup(this.trail.group); this.trail.danger.removeFromParent(); this.trail = null;
    }
    if (!pending) return;
    const group = new Group(); group.name = 'fire-propagation-trail'; this.scene.add(group);
    const orange = this.pool(group, 'orange', 48, this.flame), yellow = this.pool(group, 'yellow', 48, this.flame);
    const route = this.pool(group, 'route', 48);
    const lengths = [0];
    for (let i = 1; i < pending.path.length; i++) lengths.push(lengths.at(-1) + pending.path[i].distanceTo(pending.path[i - 1]));
    const total = lengths.at(-1), count = Math.max(2, Math.min(48, Math.ceil(total / .3)));
    route.count = count;
    const danger = new Mesh(this.ring, this.materials.danger); danger.name = `fire-threat-${pending.target.id}`;
    danger.rotation.x = -Math.PI / 2; danger.position.y = pending.target.localDimensions.height + .07;
    danger.scale.set(pending.target.localDimensions.width * .95, pending.target.localDimensions.depth * .95, 1);
    pending.target.model.add(danger);
    this.trail = { group, orange, yellow, route, pending, lengths, total, count, danger };
  }
  pointOnTrail(distance) {
    const { pending, lengths } = this.trail;
    let i = 1; while (i < lengths.length - 1 && lengths[i] < distance) i++;
    return this.sample.copy(pending.path[i - 1]).lerp(pending.path[i],
      Math.max(0, Math.min(1, (distance - lengths[i - 1]) / Math.max(.001, lengths[i] - lengths[i - 1]))));
  }
  spray(player, station) {
    let entry = this.sprayers.get(player.id);
    if (!entry && station) {
      const group = new Group(); group.name = `extinguisher-spray-${player.id}`;
      const particles = this.pool(group, 'white', 12); this.scene.add(group);
      entry = { group, particles, player }; this.sprayers.set(player.id, entry);
    }
    if (entry) { entry.station = station; entry.group.visible = Boolean(station); }
  }
  update(dt, system) {
    const visualDt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), .1) : 0;
    this.phase += visualDt; this.clock.value = this.phase; const t = this.phase;
    let lightIndex = 0;
    for (const [id, entry] of this.records) {
      const { station, red, outer, inner, smoke, sparks, fill } = entry;
      const fire = system.fires.get(id);
      const progress = fire ? fire.progress / system.durationFor(fire) : 1;
      let size = .78 + Math.min(1, Math.max(0, system.time - (fire?.startedAt ?? system.time)) / system.config.largeAge) * .22;
      size *= 1 - progress * .65;
      if (entry.recovery !== null) {
        entry.recovery -= visualDt;
        size = Math.max(0, 1 - (.8 - entry.recovery) / .22) * .35;
        smoke.material.opacity = .27 * Math.max(0, entry.recovery / .8);
        entry.recoveryRing.scale.setScalar(1 + (.8 - entry.recovery));
        if (entry.recovery <= 0) { this.remove(id); continue; }
      } else {
        fill.visible = progress > 0; fill.scale.set(.9 * progress, .04, .19); fill.position.x = -.45 + progress * .45;
        if (lightIndex < this.lights.length) {
          const light = this.lights[lightIndex++]; station.model.getWorldPosition(light.position);
          light.position.y += station.dimensions.height + .5;
          light.intensity = size * (.85 + Math.sin(t * 5 + station.position.x) * .14);
        }
      }
      const angle = station.model.rotation.y, coreX = -Math.sin(angle) * .18, coreZ = Math.cos(angle) * .18;
      for (let i = 0; i < 4; i++) {
        const pulse = 1 + Math.sin(t * 4.7 + i * 2.1 + station.position.x) * .15;
        const x = (i - 1.5) * .24, z = Math.sin(i * 2.3) * .17;
        this.matrix(outer, i, x, .42 * size, z, .24 * size, .7 * pulse * size, .24 * size);
        this.matrix(inner, i, x + coreX, .26 * size, z + coreZ, .14 * size, .43 * pulse * size, .15 * size);
        if (i < 3) this.matrix(red, i, (i - 1) * .3, .35 * size, -.05, .3 * size, .57 * pulse * size, .3 * size);
      }
      for (let i = 0; i < 3; i++) {
        const p = (t * .3 + i / 3) % 1, scale = .12 + p * .19;
        this.matrix(smoke, i, Math.sin(t + i + station.position.x) * p * .3, .65 + p * .95, -.1, scale, scale * .8, scale);
      }
      for (let i = 0; i < 5; i++) {
        const p = (t * .65 + i / 5) % 1, scale = .035 * size * (1 - p);
        this.matrix(sparks, i, Math.sin(i * 3 + t) * .38, .4 + p * 1.1, Math.cos(i + t) * .2, scale, scale * 1.7, scale);
      }
      for (const mesh of [red, outer, inner, smoke, sparks]) mesh.instanceMatrix.needsUpdate = true;
    }
    while (lightIndex < this.lights.length) this.lights[lightIndex++].intensity = 0;
    this.materials.heat.opacity = .12 + Math.sin(t * 5) * .025;
    this.materials.danger.opacity = .45 + Math.sin(t * 7) * .2;
    if (this.trail) {
      const { pending, count, total, orange, yellow, route } = this.trail;
      const progress = Math.max(0, Math.min(1, (system.time - pending.startedAt) / (pending.endsAt - pending.startedAt)));
      const active = Math.max(1, Math.floor(progress * (count - 1)) + 1); orange.count = active; yellow.count = active;
      for (let i = 0; i < count; i++) {
        const p = this.pointOnTrail(total * i / (count - 1));
        this.matrix(route, i, p.x, p.y, p.z, .035, .025, .035);
        if (i >= active) continue;
        if (i === active - 1) this.pointOnTrail(total * progress);
        const pulse = 1 + Math.sin(t * 6 + i) * .15;
        this.matrix(orange, i, p.x, p.y + .12, p.z, .105, .24 * pulse, .105);
        this.matrix(yellow, i, p.x, p.y + .08, p.z + .06, .06, .15 * pulse, .06);
      }
      for (const mesh of [orange, yellow, route]) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { group, particles, player, station } of this.sprayers.values()) {
      if (!group.visible || !station) continue;
      if (system.extinguisher?.nozzle) system.extinguisher.nozzle.getWorldPosition(this.start);
      else { player.carryAnchor.getWorldPosition(this.start); this.start.y += .4; }
      this.end.copy(station.position); this.end.y += station.dimensions.height + .45;
      for (let i = 0; i < 12; i++) {
        const p = (t * 2.8 + i / 12) % 1, scale = .045 + p * .15;
        this.matrix(particles, i, this.start.x + (this.end.x - this.start.x) * p + Math.sin(i * 7) * p * .12,
          this.start.y + (this.end.y - this.start.y) * p + Math.sin(p * Math.PI) * .12,
          this.start.z + (this.end.z - this.start.z) * p + Math.cos(i * 3) * p * .12, scale, scale, scale);
      }
      particles.instanceMatrix.needsUpdate = true;
    }
  }
  releaseGroup(group) {
    group.removeFromParent(); group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
  remove(id) {
    const entry = this.records.get(id); if (!entry) return;
    this.releaseGroup(entry.group); entry.smoke.material.dispose(); this.records.delete(id);
  }
  dispose() {
    this.setPropagation(null);
    for (const id of this.records.keys()) this.remove(id);
    for (const { group } of this.sprayers.values()) this.releaseGroup(group);
    this.sprayers.clear(); this.lights.forEach(light => light.removeFromParent());
    this.sphere.dispose(); this.flame.dispose(); this.box.dispose(); this.ring.dispose();
    Object.values(this.materials).forEach(material => material.dispose());
  }
}
