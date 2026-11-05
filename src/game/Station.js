import { Group, Vector3 } from 'three';

// Metadados, modelo e armazenamento temporário de uma estação.
export class Station {
  constructor({ id, position, width, depth, height, rotation = 0 }) {
    this.id = id;
    this.model = new Group();
    this.model.name = `station-${id}`;
    this.model.userData.stationId = id;
    this.model.position.set(position[0], 0, position[1]);
    this.model.rotation.y = rotation;
    this.position = this.model.position;
    this.localDimensions = Object.freeze({ width, depth, height });
    // As estações usam quartos de volta; o retângulo continua alinhado ao XZ.
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    this.dimensions = Object.freeze({ width: width * cos + depth * sin,
      depth: depth * cos + width * sin, height });
    const halfWidth = this.dimensions.width / 2;
    const halfDepth = this.dimensions.depth / 2;
    this.collider = {
      id,
      position: { x: this.position.x, z: this.position.z },
      width: this.dimensions.width,
      depth: this.dimensions.depth,
      bounds: { minX: this.position.x - halfWidth, maxX: this.position.x + halfWidth,
        minZ: this.position.z - halfDepth, maxZ: this.position.z + halfDepth },
    };
    this.front = new Vector3(Math.sin(rotation), 0, Math.cos(rotation));
    this.storage = null;
    this.storedIngredient = null;
  }

  configureStorage({ position, width, depth }) {
    const anchor = new Group();
    anchor.name = `storage-${this.id}`;
    anchor.position.set(...position);
    this.model.add(anchor);
    this.storage = Object.freeze({ anchor, width, depth });
  }

  getApproachPosition(radius = 0.52, clearance = 0.2) {
    return this.position.clone().addScaledVector(this.front, this.localDimensions.depth / 2 + radius + clearance);
  }
}
