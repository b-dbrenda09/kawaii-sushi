import { Group } from 'three';

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// Only transforms visuals. Recipe validation and ingredient ownership stay in AssemblySystem.
export class AssemblyEffects {
  constructor(assembly) {
    this.assembly = assembly;
    this.elapsed = 0;
    this.stage = 'idle';
  }

  clear() {
    for (const pose of this.poses ?? []) {
      pose.mesh.position.copy(pose.position);
      pose.mesh.scale.copy(pose.scale);
      pose.mesh.visible = pose.visible;
    }
    this.roll?.removeFromParent();
    this.sparkles?.removeFromParent();
    this.sparkles = null;
    this.roll = null;
    this.sections = [];
    this.slats = [];
    this.knife = null;
    this.poses = [];
    this.recipe = null;
    this.stage = 'idle';
  }

  place(state) {
    this.clear();
    this.elapsed = 0;
    this.stage = state === 'rice_cooked' ? 'spreading-rice' : 'placing-ingredient';
    const { factory, preview } = this.assembly;
    const materials = state === 'rice_cooked' ? [factory.materials.rice]
      : state === 'nori_sheet' ? [factory.materials.nori]
        : state === 'salmon_cut' ? [factory.materials.salmon, factory.materials.stripe] : [factory.materials.cucumber];
    this.poses = preview.children.filter(mesh => materials.includes(mesh.material)).map(mesh => this.pose(mesh));
  }

  pose(mesh) {
    return { mesh, position: mesh.position.clone(), scale: mesh.scale.clone(), visible: mesh.visible };
  }

  finish(recipe) {
    this.clear();
    this.elapsed = 0;
    this.recipe = recipe;
    this.stage = recipe.model === 'nigiri' ? 'shaping-nigiri' : 'rolling';
    const { dish, factory } = this.assembly;
    this.poses = dish.model.children.slice(2).map(mesh => this.pose(mesh));
    this.sparkles = new Group();
    this.sparkles.name = 'assembly-completion-sparkles';
    for (let i = 0; i < 5; i++) {
      const star = new Group();
      const angle = i * Math.PI * 2 / 5;
      star.position.set(Math.cos(angle) * .3, .37, Math.sin(angle) * .2);
      factory.box(star, 'stripe', [.012, .065, .012], [0, 0, 0]);
      factory.box(star, 'stripe', [.055, .012, .012], [0, 0, 0]);
      this.sparkles.add(star);
    }
    this.sparkles.visible = false;
    dish.model.add(this.sparkles);
    if (recipe.model === 'nigiri') return;
    this.roll = new Group();
    this.roll.name = 'assembly-rolling-sushi';
    dish.model.add(this.roll);
    // Four adjoining sections become the four plated pieces after slicing.
    this.sections = [];
    this.slats = [];
    for (let i = 0; i < 12; i++) {
      const slat = factory.box(this.roll, 'bamboo', [.65, .012, .033], [0, .08, (i - 5.5) * .035]);
      this.slats.push(slat);
    }
    this.knife = new Group();
    this.knife.position.y = .4;
    factory.box(this.knife, 'blade', [.025, .13, .32], [0, 0, 0]);
    factory.box(this.knife, 'bamboo', [.04, .045, .15], [0, .06, .2]);
    this.roll.add(this.knife);
    for (let i = 0; i < 4; i++) {
      const section = new Group();
      section.position.set((i - 1.5) * .14, .17, 0);
      section.rotation.z = -Math.PI / 2;
      const outside = recipe.model === 'uramaki' ? 'rice' : 'nori';
      factory.mesh(section, factory.cylinder, outside, [0, 0, 0], [.1, .135, .1]);
      factory.mesh(section, factory.cylinder, outside === 'rice' ? 'nori' : 'rice', [0, .069, 0], [.079, .004, .079]);
      factory.mesh(section, factory.cylinder, recipe.model === 'uramaki' ? 'cucumber' : 'salmon', [0, .073, 0], [.037, .005, .037]);
      this.roll.add(section);
      this.sections.push(section);
    }
    this.roll.visible = false;
  }

  update(dt) {
    if (this.stage === 'idle') return;
    this.elapsed += dt;
    if (!this.recipe) {
      const t = smooth(this.elapsed / .55);
      for (const { mesh, position, scale } of this.poses) {
        mesh.position.y = position.y + .22 * (1 - t);
        const spread = this.stage === 'spreading-rice' ? .35 + .65 * t : 1;
        mesh.position.x = position.x * spread;
        mesh.position.z = position.z * spread;
        mesh.scale.set(scale.x * spread, scale.y, scale.z * spread);
      }
      if (t === 1) this.clear();
      return;
    }
    if (this.recipe.model === 'nigiri') {
      this.animateSparkles(this.elapsed / .9);
      const t = smooth(this.elapsed / .9);
      for (const { mesh, position, scale } of this.poses) {
        const fish = mesh.material !== this.assembly.factory.materials.rice;
        mesh.position.y = position.y + (fish ? .2 : .04) * (1 - t);
        mesh.scale.y = scale.y * (fish ? 1 : .6 + .4 * t);
      }
      if (t === 1) this.clear();
      return;
    }
    const t = this.elapsed;
    this.animateSparkles((t - 1.15) / .5);
    this.stage = t < .7 ? 'rolling' : t < 1.15 ? 'slicing-roll' : 'plating';
    this.roll.visible = t < 1.65;
    for (const pose of this.poses) pose.mesh.visible = t >= 1.65;
    const curl = smooth(t / .7), plate = smooth((t - 1.15) / .5);
    this.slats.forEach((slat, i) => {
      const angle = (i / 11 * Math.PI * 1.8 - Math.PI * .9) * curl;
      slat.position.set(0, .075 + (1 - Math.cos(angle)) * .12,
        (i - 5.5) * .035 * (1 - curl) + Math.sin(angle) * .12 * curl);
      slat.rotation.x = -angle;
      slat.visible = t < .7;
    });
    this.knife.visible = t >= .7 && t < 1.15;
    const stroke = Math.max(0, (t - .7) / .45 * 3);
    this.knife.position.set((Math.min(2, Math.floor(stroke)) - 1) * .14,
      .29 + .18 * Math.abs(Math.cos(stroke * Math.PI)), 0);
    this.sections.forEach((section, i) => {
      section.scale.set(1, .35 + .65 * curl, 1);
      section.position.set((i - 1.5) * .14 * (1 - plate) + (i < 2 ? -.15 : .15) * plate,
        .17, (i % 2 ? .125 : -.125) * plate);
      section.rotation.z = -Math.PI / 2 * (1 - plate);
      section.position.x += Math.sign(i - 1.5) * .018 * smooth((t - .7) / .45) * (1 - plate);
    });
    if (t >= 1.65) this.clear();
  }

  animateSparkles(t) {
    this.sparkles.visible = t > 0 && t < 1;
    const pulse = Math.max(0, Math.sin(Math.PI * t));
    this.sparkles.scale.setScalar(.6 + pulse * .4);
    this.sparkles.rotation.y = t * .3;
  }

  dispose() { this.clear(); }
}
