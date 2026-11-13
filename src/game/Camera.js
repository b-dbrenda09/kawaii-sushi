import { Box3, OrthographicCamera, Vector3 } from 'three';

import { CAMERA_CONFIG } from './CameraConfig.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Camera {
  constructor(width, height, bounds = new Box3(new Vector3(-9.4, -0.5, -7.4), new Vector3(9.4, 3.8, 7.4)), config = {}) {
    this.bounds = bounds.clone();
    this.settings = { ...CAMERA_CONFIG, ...config };
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.width = width; this.height = height;
    this.configure(config);
  }

  configure(changes = {}) {
    Object.assign(this.settings, changes);
    if ('inclination' in changes && !('height' in changes)) this.settings.height = null;
    const settings = this.settings;
    settings.frontDistance = clamp(Number.isFinite(settings.frontDistance) ? settings.frontDistance : CAMERA_CONFIG.frontDistance,
      CAMERA_CONFIG.minFrontDistance, CAMERA_CONFIG.maxFrontDistance);
    const angle = Number.isFinite(settings.height) && settings.height > 0
      ? Math.atan2(settings.height, settings.frontDistance) * 180 / Math.PI : settings.inclination;
    settings.inclination = clamp(Number.isFinite(angle) ? angle : CAMERA_CONFIG.inclination,
      CAMERA_CONFIG.minInclination, CAMERA_CONFIG.maxInclination);
    settings.zoom = clamp(Number.isFinite(settings.zoom) ? settings.zoom : 1, CAMERA_CONFIG.minZoom, CAMERA_CONFIG.maxZoom);
    settings.targetHeightRatio = clamp(Number.isFinite(settings.targetHeightRatio) ? settings.targetHeightRatio : CAMERA_CONFIG.targetHeightRatio, .75, .85);
    settings.targetWidthRatio = clamp(Number.isFinite(settings.targetWidthRatio) ? settings.targetWidthRatio : CAMERA_CONFIG.targetWidthRatio, .85, .96);
    settings.edgeMargin = clamp(Number.isFinite(settings.edgeMargin) ? settings.edgeMargin : CAMERA_CONFIG.edgeMargin, .01, .05);
    this.target = this.bounds.getCenter(new Vector3());
    const offset = settings.lookAtOffset ?? CAMERA_CONFIG.lookAtOffset;
    for (const axis of ['x', 'y', 'z']) this.target[axis] += Number.isFinite(offset[axis]) ? offset[axis] : 0;
    const elevation = settings.frontDistance * Math.tan(settings.inclination * Math.PI / 180);
    // Front is +Z: zero horizontal orbit and no roll. World X remains screen horizontal.
    this.camera.position.copy(this.target).add(new Vector3(0, elevation, settings.frontDistance));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.far = Math.max(100, this.camera.position.distanceTo(this.target) + this.bounds.getSize(new Vector3()).length() * 2);
    this.camera.updateMatrixWorld(true);
    const projected = new Box3();
    for (const x of [this.bounds.min.x, this.bounds.max.x]) {
      for (const y of [this.bounds.min.y, this.bounds.max.y]) {
        for (const z of [this.bounds.min.z, this.bounds.max.z]) {
          projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse));
        }
      }
    }
    this.frameWidth = 2 * Math.max(Math.abs(projected.min.x), Math.abs(projected.max.x));
    this.frameHeight = 2 * Math.max(Math.abs(projected.min.y), Math.abs(projected.max.y));
    this.resize(this.width, this.height);
  }

  resize(width, height) {
    this.width = Math.max(width, 1); this.height = Math.max(height, 1);
    const settings = this.settings;
    const margin = settings.edgeMargin;
    this.insets = { left: this.width * margin, right: this.width * margin,
      top: this.height * margin, bottom: this.height * margin };
    // Fit the projected bounds against the full canvas, independently of HUD size or order count.
    const baseUnit = Math.max(this.frameWidth / (this.width * settings.targetWidthRatio),
      this.frameHeight / (this.height * settings.targetHeightRatio));
    const minimumUnit = Math.max(this.frameWidth / (this.width * (1 - 2 * margin)),
      this.frameHeight / (this.height * (1 - 2 * margin)));
    const unit = Math.max(baseUnit / settings.zoom, minimumUnit);
    this.effectiveZoom = baseUnit / unit;
    const halfWidth = this.width * unit / 2, halfHeight = this.height * unit / 2;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }
}
