// Renderer primitives: the textured billboard quad every visual is built from,
// plus the single table of scene z-layers. Depends on Three.js and nothing else
// in the game, so every other render module can import it freely.

import * as THREE from '../../lib/three.module.min.js';

// One place for the draw order. The scene is orthographic and everything is a
// flat quad, so these are pure sort keys — bigger draws on top.
export const Z = {
  terrain: 0,
  ore: 0.05,
  scorch: 0.08,
  building: 0.5,
  crack: 0.55,
  dish: 0.62,
  guardGun: 0.7,
  shadow: 0.9,
  unit: 1,
  turret: 1.1,
  harvSpin: 1.2,
  select: 1.5,
  rally: 1.55,
  health: 1.6,
  rank: 1.62,
  projectile: 2.0,
  smoke: 2.05,
  puff: 2.1,
  explosion: 2.2,
  muzzle: 2.25,
  tracer: 2.3,
  empRing: 2.35,
  debris: 2.4,
  ghost: 2.6,
  cloud: 2.9,
  fog: 3,
};

export function texFromCanvas(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SpriteQuad {
  // billboard quad in world units (cells)
  constructor(scene, canvas, wCells, hCells, z) {
    this.tex = texFromCanvas(canvas);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wCells, hCells), this.mat);
    this.mesh.position.z = z;
    scene.add(this.mesh);
  }
  setCanvas(c) {
    // re-upload only when the backing canvas actually changes — calling this
    // every frame with the same canvas must not cost a GPU upload
    if (this.tex.image !== c) {
      this.tex.image = c;
      this.tex.needsUpdate = true;
    }
  }
  touch() { this.tex.needsUpdate = true; } // after drawing into the same canvas
  set(x, y, z) { this.mesh.position.set(x, y, z ?? this.mesh.position.z); }
  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

// map y grows down; scene y grows up
export function mapY(y) { return -y; }
