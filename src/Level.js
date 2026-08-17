import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Turns a map definition (src/maps/Maps.js) into meshes + collision data.
// ---------------------------------------------------------------------------
export class Level {
  static CLOUD_Y = -2; // the cloud deck — falling through it respawns you
  static platforms = [];   // { mesh, base, move?, half, prev, delta }
  static checkpoints = []; // { pos, mesh, reached }
  static hazards = [];     // red killbricks: { type, mesh/group, ... }
  static killMat = null;
  static finish = null;
  static flagMesh = null;
  static group = null;
  static map = null;

  static build(scene, map) {
    Level.dispose(scene);
    Level.map = map;
    Level.group = new THREE.Group();
    Level.platforms = [];
    Level.checkpoints = [];
    const theme = map.theme;

    const stoneA = new THREE.MeshStandardMaterial({ color: theme.a, roughness: 0.9 });
    const stoneB = new THREE.MeshStandardMaterial({ color: theme.b, roughness: 0.9 });
    const moverMat = new THREE.MeshStandardMaterial({
      color: theme.mover, roughness: 0.6, emissive: theme.moverGlow, emissiveIntensity: 0.7,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe8f2fa, roughness: 1.0, emissive: 0xbcd8ee, emissiveIntensity: 0.35,
    });

    map.platforms.forEach((def, i) => {
      const [x, y, z] = def.p;
      const [w, h, d] = def.s;
      const mat = def.move ? moverMat : (i % 2 ? stoneB : stoneA);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      Level.group.add(mesh);

      const rim = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h * 0.35, d * 1.06), rimMat);
      rim.position.set(0, -h * 0.5, 0);
      mesh.add(rim);

      Level.platforms.push({
        mesh,
        base: new THREE.Vector3(x, y, z),
        move: def.move || null,
        half: new THREE.Vector3(w / 2, h / 2, d / 2),
        prev: new THREE.Vector3(x, y, z),
        delta: new THREE.Vector3(),
      });
    });

    // red killbrick hazards
    Level.hazards = [];
    Level.killMat = new THREE.MeshStandardMaterial({
      color: 0xff3030, roughness: 0.35, emissive: 0xcc0808, emissiveIntensity: 0.9,
    });
    for (const def of map.hazards || []) {
      if (def.type === 'box') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.s), Level.killMat);
        mesh.position.set(...def.p);
        mesh.castShadow = true;
        Level.group.add(mesh);
        Level.hazards.push({
          type: 'box', mesh,
          half: new THREE.Vector3(def.s[0] / 2, def.s[1] / 2, def.s[2] / 2),
        });
      } else if (def.type === 'spinner') {
        const group = new THREE.Group();
        group.position.set(...def.p);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(def.len * 2, 0.42, 0.55), Level.killMat);
        bar.castShadow = true;
        group.add(bar);
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.55, 12),
          new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.5 })
        );
        group.add(hub);
        Level.group.add(group);
        Level.hazards.push({
          type: 'spinner', group, len: def.len,
          speed: def.speed, phase: def.phase, angle: 0,
        });
      }
    }

    // checkpoint pads
    const cpGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.12, 32);
    map.checkpoints.forEach((c) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2bd97c, emissive: 0x0e8c48, emissiveIntensity: 0.8, roughness: 0.4,
      });
      const mesh = new THREE.Mesh(cpGeo, mat);
      mesh.position.set(c[0], c[1] + 0.06, c[2]);
      mesh.receiveShadow = true;
      Level.group.add(mesh);
      Level.checkpoints.push({ pos: new THREE.Vector3(...c), mesh, reached: false });
    });

    // finish: pole + flag + gold ring
    const f = map.finish;
    Level.finish = { pos: new THREE.Vector3(...f), radius: 2.2 };
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.4 })
    );
    pole.position.set(f[0], f[1] + 2, f[2]);
    pole.castShadow = true;
    Level.group.add(pole);
    Level.flagMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffc63a, emissive: 0xa06a00, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      })
    );
    Level.flagMesh.position.set(f[0] + 0.85, f[1] + 3.4, f[2]);
    Level.group.add(Level.flagMesh);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 12, 48),
      new THREE.MeshStandardMaterial({ color: 0xffc63a, emissive: 0x8a5c00, emissiveIntensity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(f[0], f[1] + 0.05, f[2]);
    Level.group.add(ring);

    scene.add(Level.group);
  }

  static dispose(scene) {
    if (!Level.group) return;
    scene.remove(Level.group);
    Level.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    Level.group = null;
  }

  static update(t, dt) {
    for (const p of Level.platforms) {
      p.prev.copy(p.mesh.position);
      if (p.move) {
        const off = Math.sin(t * p.move.speed + p.move.phase) * p.move.range;
        const pos = p.base.clone();
        pos[p.move.axis] += off;
        p.mesh.position.copy(pos);
      }
      p.delta.subVectors(p.mesh.position, p.prev);
    }
    for (const c of Level.checkpoints) {
      c.mesh.rotation.y += dt * (c.reached ? 2.5 : 0.6);
    }
    if (Level.flagMesh) Level.flagMesh.rotation.y = Math.sin(t * 2) * 0.3;

    // hazards: spin the sweepers, pulse the danger glow
    for (const hz of Level.hazards) {
      if (hz.type === 'spinner') {
        hz.angle = t * hz.speed + hz.phase;
        hz.group.rotation.y = hz.angle;
      }
    }
    if (Level.killMat) Level.killMat.emissiveIntensity = 0.75 + Math.sin(t * 5) * 0.3;
  }

  static reset() {
    for (const c of Level.checkpoints) {
      c.reached = false;
      c.mesh.material.color.setHex(0x2bd97c);
      c.mesh.material.emissive.setHex(0x0e8c48);
    }
  }
}
