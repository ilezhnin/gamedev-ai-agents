// The renderer facade. Owns the Three.js scene/camera/context and the three
// visual subsystems (map layers, entity views, effects); everything outside
// src/render talks to this object rather than to raw quads.

import * as THREE from '../../lib/three.module.min.js';
import { TILE } from '../sprites.js';
import { Layers } from './layers.js';
import { Views } from './views.js';
import { Fx } from './fx.js';

export class Renderer {
  constructor(canvas, viewEl, sprites) {
    this.canvas = canvas;
    this.viewEl = viewEl;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.gl.setPixelRatio(1); // chunky pixels, CSS upscales

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101010');
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

    this.layers = new Layers(this.scene, sprites);
    this.fx = new Fx(this.scene, sprites);
    this.views = new Views(this.scene, sprites, () => this.fx.kickShake());
    this.fogT = 0;                 // fog redraw is throttled to 5 Hz
  }

  resize() {
    const w = this.viewEl.clientWidth, h = this.viewEl.clientHeight;
    this.gl.setSize(Math.floor(w / 2), Math.floor(h / 2), false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  build(map, game) {
    this.layers.build(map, game);
  }

  redrawFog(game) { this.layers.redrawFog(game); }

  // drop every view: safe for both quad- and line-based fx, and safe to call
  // with no game yet (first match). The final sweep is the backstop for
  // anything a subsystem forgot to remove from the scene.
  teardown(game) {
    this.views.dispose();
    this.fx.dispose(game);
    this.layers.dispose();
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }

  // ctx: { game, map, input, halted }
  sync(dt, ctx) {
    const { game, halted } = ctx;
    if (game.oreDirty) { game.oreDirty = false; this.layers.redrawOre(); }
    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = 0.2; this.layers.redrawFog(game); }
    if (!halted) {
      this.layers.tickWater(dt);
      this.layers.stepClouds(dt);
      this.fx.stepShake(dt);
    }
    this.views.sync(dt, ctx);
    this.fx.sync(halted ? 0 : dt, ctx);
    this.fx.syncPlacementGhost(ctx);
    this.fx.syncRallyFlags(ctx);
  }

  // draw from the camera state (cells); returns the visible size in cells so
  // the caller can draw the radar view rectangle
  render(cam) {
    // scene lives at y' = -mapY, camera looks down -z
    const w = this.viewEl.clientWidth / 2, h = this.viewEl.clientHeight / 2; // render px
    const cellsW = w / (TILE * cam.zoom / 2);
    const cellsH = h / (TILE * cam.zoom / 2);
    // building-death shake offsets the render camera only, never the sim
    const [shx, shy] = this.fx.shakeOffset();
    this.camera.position.set(cam.x + shx, -cam.y + shy, 5);
    this.camera.left = -cellsW / 2;
    this.camera.right = cellsW / 2;
    this.camera.top = cellsH / 2;
    this.camera.bottom = -cellsH / 2;
    this.camera.updateProjectionMatrix();
    this.gl.render(this.scene, this.camera);
    return { cellsW, cellsH };
  }

  clear() { this.gl.clear(); }
}
