import { Box3, OrthographicCamera, Vector3 } from 'three';

export class Camera {
  constructor(width, height, bounds = new Box3(new Vector3(-9.4, -0.5, -7.4), new Vector3(9.4, 3.8, 7.4))) {
    this.bounds = bounds.clone();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // Mesma inclinação nos três eixos para uma visão isométrica.
    const center = this.bounds.getCenter(new Vector3());
    this.camera.position.copy(center).add(new Vector3(24, 24, 24));
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld(true);
    // Projeta os oito cantos para calcular o enquadramento real do cenário.
    const projected = new Box3();
    for (const x of [this.bounds.min.x, this.bounds.max.x]) {
      for (const y of [this.bounds.min.y, this.bounds.max.y]) {
        for (const z of [this.bounds.min.z, this.bounds.max.z]) {
          projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
        }
      }
    }
    this.frameWidth = projected.max.x - projected.min.x;
    this.frameHeight = projected.max.y - projected.min.y;
    this.resize(width, height);
  }

  resize(width, height) {
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    // Margem de 12% sem distorção, inclusive em celulares na vertical.
    const halfHeight = Math.max(this.frameHeight, this.frameWidth / aspect) * 1.12 / 2;
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
}
