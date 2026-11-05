import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

export class CuttingEffects {
  constructor(station) {
    this.station = station;
    this.disposed = false;
    this.flashRemaining = 0;
    this.decorations = station.model.children.filter((mesh) => ['salmon-piece', 'salmon-stripe'].includes(mesh.name))
      .map((mesh) => ({ mesh, visible: mesh.visible }));
    this.decorations.forEach(({ mesh }) => { mesh.visible = false; });
    this.knifeParts = ['decorative-knife-blade', 'decorative-knife-handle'].map((name) => {
      const mesh = station.model.getObjectByName(name);
      return { mesh, position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone(), visible: mesh.visible };
    });
    this.knife = new Group();
    this.knife.name = 'cutting-knife-animation';
    station.model.add(this.knife);
    for (const { mesh, position } of this.knifeParts) {
      this.knife.add(mesh);
      mesh.position.copy(position).sub(this.knifeParts[0].position);
    }
    this.geometry = new BoxGeometry(0.045, 0.015, 0.045);
    this.material = new MeshBasicMaterial({ color: '#fff2df', transparent: true, opacity: 0, depthWrite: false });
    this.marks = new Group();
    this.marks.name = 'cutting-impact';
    for (let i = 0; i < 3; i++) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.position.set((i - 1) * 0.09, 0.025 + i % 2 * 0.035, (i % 2 - 0.5) * 0.12);
      this.marks.add(mesh);
    }
    station.model.add(this.marks);
  }

  impact(cutting) {
    this.flashRemaining = 0.18;
    this.marks.position.copy(cutting.boardAnchor.position);
    this.marks.position.y += 0.16;
  }

  update(deltaTime, cutting) {
    if (this.disposed) return;
    if (cutting.isCutting) {
      const q = cutting.chopProgress;
      const smooth = (value) => value * value * (3 - 2 * value);
      const lift = q < 0.35 ? 0.5 + 0.5 * smooth(q / 0.35)
        : q < 0.6 ? 1 - smooth((q - 0.35) / 0.25) : 0.5 * smooth((q - 0.6) / 0.4);
      this.knife.position.copy(cutting.boardAnchor.position);
      this.knife.position.x += -0.3 + (cutting.cuts + 0.5) * 0.6 / cutting.requiredCuts;
      this.knife.position.y += 0.055 + lift * 0.3;
      this.knife.rotation.set(Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
    } else {
      this.knife.position.copy(this.knifeParts[0].position);
      this.knife.rotation.set(0, 0, 0, 'XYZ');
    }
    // Mantém a faca fora do ingrediente entre golpes; a tábua continua no mesmo lugar.
    this.knife.visible = cutting.state === 'EMPTY' || cutting.isCutting;
    if (cutting.state === 'EMPTY') this.flashRemaining = 0;
    this.flashRemaining = Math.max(0, this.flashRemaining - Math.min(deltaTime, 0.05));
    this.marks.visible = this.flashRemaining > 0;
    this.material.opacity = this.flashRemaining / 0.18 * 0.55;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.knifeParts) {
      this.station.model.add(part.mesh);
      part.mesh.position.copy(part.position);
      part.mesh.quaternion.copy(part.quaternion);
      part.mesh.scale.copy(part.scale);
      part.mesh.visible = part.visible;
    }
    this.decorations.forEach(({ mesh, visible }) => { mesh.visible = visible; });
    this.knife.removeFromParent(); this.marks.removeFromParent();
    this.geometry.dispose(); this.material.dispose();
  }
}
