import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Floating name label rendered to a canvas sprite. Used for the local player
// and, later, multiplayer ghosts.
// ---------------------------------------------------------------------------
export class NameTag {
  static make(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = '700 42px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(name).width) + 48;
    canvas.width = w;
    canvas.height = 72;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // pill background
    ctx.fillStyle = 'rgba(15, 8, 4, 0.65)';
    const r = 30;
    ctx.beginPath();
    ctx.roundRect(2, 6, w - 4, 60, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 150, 60, 0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffe6c4';
    ctx.fillText(name, w / 2, 38);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false,
    }));
    const scale = 0.008;
    sprite.scale.set(w * scale, 72 * scale, 1);
    sprite.renderOrder = 999;
    return sprite;
  }
}
