import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ---------------------------------------------------------------------------
// Sky life.
// Birds: real animated models (Parrot / Flamingo / Stork, three.js examples).
// Dragons: smooth continuous-skin serpents — a tapered tube is rebuilt along
// the flight curve every frame (no visible segments), with vertex-color
// belly gradients, detailed head, two-bone wings, legs, spikes and tail fin.
// Optional upgrade: drop a rigged model at assets/dragons/Dragon.glb (e.g.
// Quaternius' CC0 "Dragon Evolved" from poly.pizza) and it is used instead.
// ---------------------------------------------------------------------------
const TUBE_N = 48;  // samples along the body
const TUBE_R = 10;  // radial segments

export class Critters {
  static flocks = [];
  static mixers = [];
  static dragons = [];
  static glbDragons = null; // replaces procedural dragons when a GLB exists
  static group = null;

  static init(scene) {
    Critters.group = new THREE.Group();
    const cfgs = [
      {
        body: 0x2e8f68, spine: 0x1e6b4c, belly: 0xb4e0c4, membrane: 0xd8663f,
        bone: 0xe8dcc8, eye: 0xffd040, scale: 1.4, speed: 0.11, span: 0.5,
        path: (u, out) => out.set(Math.sin(u * 2) * 26, 12 + Math.sin(u * 3) * 4, -100 + Math.sin(u) * 120),
      },
      {
        body: 0x9b3f4c, spine: 0x6e2a36, belly: 0xeab9a0, membrane: 0x4f7fc4,
        bone: 0xe8dcc8, eye: 0x9fff70, scale: 1.9, speed: -0.07, span: 0.55,
        path: (u, out) => out.set(Math.cos(u) * 42, 24 + Math.sin(u * 2) * 3, -95 + Math.sin(u) * 105),
      },
    ];
    for (const cfg of cfgs) Critters.dragons.push(Critters.buildDragon(cfg));
    scene.add(Critters.group);
    Critters.loadBirds();
    Critters.tryLoadDragonGLB(cfgs);
  }

  // ---- birds -------------------------------------------------------------
  static async loadBirds() {
    const loader = new GLTFLoader();
    const defs = [
      { file: 'Parrot', count: 5, size: 1.0, center: [-14, 8, -35], r: 10, speed: 0.55 },
      { file: 'Flamingo', count: 4, size: 1.5, center: [16, 13, -105], r: 14, speed: 0.3 },
      { file: 'Stork', count: 3, size: 1.7, center: [-12, 17, -185], r: 13, speed: 0.36 },
    ];
    for (const def of defs) {
      let gltf;
      try {
        gltf = await loader.loadAsync(`./assets/birds/${def.file}.glb`);
      } catch (e) {
        console.warn('bird load failed', def.file, e);
        continue;
      }
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      const span = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z, 0.001);
      const s = def.size / span;

      const birds = [];
      for (let i = 0; i < def.count; i++) {
        const model = SkeletonUtils.clone(gltf.scene);
        model.scale.setScalar(s);
        model.traverse((o) => {
          if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
        });
        const wrapper = new THREE.Group();
        wrapper.add(model);
        wrapper.userData.offset = i * (Math.PI * 2 / def.count) + Math.random() * 0.3;
        Critters.group.add(wrapper);

        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(gltf.animations[0]);
        action.timeScale = 0.9 + Math.random() * 0.4;
        action.startAt(-Math.random() * 2).play();
        Critters.mixers.push(mixer);
        birds.push(wrapper);
      }
      Critters.flocks.push({ ...def, birds });
    }
  }

  // ---- optional premium dragon (drop-in GLB) -----------------------------
  static async tryLoadDragonGLB(cfgs) {
    let gltf;
    try {
      gltf = await new GLTFLoader().loadAsync('./assets/dragons/Dragon.glb');
    } catch { return; } // no file — procedural dragons stay
    const clips = gltf.animations || [];
    const fly = clips.find((c) => /fly/i.test(c.name)) || clips[0];

    Critters.glbDragons = [];
    cfgs.forEach((cfg, i) => {
      const model = SkeletonUtils.clone(gltf.scene);
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      const len = Math.max(bbox.max.z - bbox.min.z, bbox.max.x - bbox.min.x, 0.001);
      model.scale.setScalar((7 + i * 3) / len); // ~7-10 units long
      model.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false; });
      const wrapper = new THREE.Group();
      wrapper.add(model);
      Critters.group.add(wrapper);
      if (fly) {
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(fly).startAt(-i).play();
        Critters.mixers.push(mixer);
      }
      Critters.glbDragons.push({ wrapper, cfg });
    });
    // hide the procedural ones
    for (const d of Critters.dragons) d.root.visible = false;
  }

  // ---- procedural dragon v3: continuous skinned body ---------------------
  static radiusProfile(t, S) {
    const keys = [[0, 0.3], [0.1, 0.4], [0.2, 0.55], [0.36, 0.52], [0.52, 0.38], [0.7, 0.22], [0.88, 0.09], [1, 0.03]];
    for (let i = 0; i < keys.length - 1; i++) {
      const [ta, ra] = keys[i], [tb, rb] = keys[i + 1];
      if (t <= tb) return (ra + (rb - ra) * ((t - ta) / (tb - ta))) * S;
    }
    return keys[keys.length - 1][1] * S;
  }

  static buildDragon(cfg) {
    const S = cfg.scale;
    const root = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.body, roughness: 0.75, flatShading: true });
    const bellyMat = new THREE.MeshStandardMaterial({ color: cfg.belly, roughness: 0.85, flatShading: true });
    const membraneMat = new THREE.MeshStandardMaterial({
      color: cfg.membrane, roughness: 0.9, side: THREE.DoubleSide, flatShading: true,
    });
    const boneMat = new THREE.MeshStandardMaterial({ color: cfg.bone, roughness: 0.6, flatShading: true });

    const dragon = { cfg, root, wings: [], spikes: [], anchors: {} };

    // ----- continuous body tube (positions rebuilt every frame) -----
    const geo = new THREE.BufferGeometry();
    const vertCount = TUBE_N * TUBE_R;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    // static vertex colors: spine darker on top, belly lighter underneath,
    // subtle darkening toward the tail
    const colors = new Float32Array(vertCount * 3);
    const cSpine = new THREE.Color(cfg.spine);
    const cBody = new THREE.Color(cfg.body);
    const cBelly = new THREE.Color(cfg.belly);
    const tmpC = new THREE.Color();
    for (let i = 0; i < TUBE_N; i++) {
      const t = i / (TUBE_N - 1);
      for (let j = 0; j < TUBE_R; j++) {
        const theta = (j / TUBE_R) * Math.PI * 2;
        const up = Math.sin(theta); // +1 top, -1 belly
        if (up >= 0.25) tmpC.lerpColors(cBody, cSpine, (up - 0.25) / 0.75);
        else if (up <= -0.15) tmpC.lerpColors(cBody, cBelly, (-up - 0.15) / 0.85);
        else tmpC.copy(cBody);
        tmpC.multiplyScalar(1 - t * 0.12); // tail slightly darker
        colors.set([tmpC.r, tmpC.g, tmpC.b], (i * TUBE_R + j) * 3);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const indices = [];
    for (let i = 0; i < TUBE_N - 1; i++) {
      for (let j = 0; j < TUBE_R; j++) {
        const a = i * TUBE_R + j, b = i * TUBE_R + (j + 1) % TUBE_R;
        const c = (i + 1) * TUBE_R + j, d = (i + 1) * TUBE_R + (j + 1) % TUBE_R;
        indices.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(indices);
    const tube = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.72,
    }));
    tube.frustumCulled = false;
    root.add(tube);
    dragon.tube = tube;

    // curve driven by control points updated from the flight path
    dragon.ctrl = Array.from({ length: 12 }, () => new THREE.Vector3());
    dragon.curve = new THREE.CatmullRomCurve3(dragon.ctrl, false, 'catmullrom', 0.5);

    // ----- detailed head -----
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.85), bodyMat);
    skull.position.z = 0.1;
    head.add(skull);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), bodyMat);
    brow.position.set(0, 0.3, 0.28);
    head.add(brow);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.6), bodyMat);
    snout.position.set(0, -0.02, 0.75);
    head.add(snout);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), bellyMat);
    nose.position.set(0, 0.12, 0.95);
    head.add(nose);
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.2, 0.35);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.62), bellyMat);
    jaw.position.z = 0.33;
    jawPivot.add(jaw);
    // teeth
    for (const tz of [0.15, 0.35, 0.55]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), boneMat);
      tooth.position.set(0.12, 0.08, tz);
      jawPivot.add(tooth);
      const tooth2 = tooth.clone();
      tooth2.position.x = -0.12;
      jawPivot.add(tooth2);
    }
    head.add(jawPivot);
    dragon.jaw = jawPivot;
    for (const side of [-1, 1]) {
      const h1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), boneMat);
      h1.position.set(side * 0.22, 0.42, -0.15);
      h1.rotation.x = -0.9;
      head.add(h1);
      const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 5), boneMat);
      h2.position.set(side * 0.22, 0.62, -0.44);
      h2.rotation.x = -1.5;
      head.add(h2);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 5),
        new THREE.MeshStandardMaterial({ color: cfg.eye, emissive: cfg.eye, emissiveIntensity: 0.9 })
      );
      eye.position.set(side * 0.3, 0.12, 0.42);
      head.add(eye);
      const frill = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), boneMat);
      frill.position.set(side * 0.34, 0, -0.2);
      frill.rotation.z = side * 1.9;
      head.add(frill);
    }
    head.scale.setScalar(S);
    root.add(head);
    dragon.head = head;

    // ----- anchors that ride the curve: wings, legs, spikes, fin -----
    const mkAnchor = (t) => {
      const g = new THREE.Group();
      g.userData.t = t;
      root.add(g);
      return g;
    };

    // wings at the shoulders
    const wingAnchor = mkAnchor(0.17);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.3 * S, 0.25 * S, 0);
      const armLen = 1.5 * S;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * S, 0.04 * S, armLen, 5), bodyMat);
      arm.rotation.z = side * Math.PI / 2;
      arm.position.x = side * armLen / 2;
      shoulder.add(arm);
      const innerShape = new THREE.Shape();
      innerShape.moveTo(0, 0);
      innerShape.lineTo(armLen, 0.1 * S);
      innerShape.lineTo(armLen, -0.55 * S);
      innerShape.lineTo(0.15 * S, -0.4 * S);
      innerShape.lineTo(0, 0);
      const innerFlat = new THREE.Group();
      innerFlat.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(new THREE.ShapeGeometry(innerShape), membraneMat);
      inner.scale.x = side;
      innerFlat.add(inner);
      shoulder.add(innerFlat);

      const elbow = new THREE.Group();
      elbow.position.x = side * armLen;
      const outerLen = 1.7 * S;
      const outerShape = new THREE.Shape();
      outerShape.moveTo(0, 0.1 * S);
      outerShape.lineTo(outerLen * 0.55, 0);
      outerShape.lineTo(outerLen, -0.25 * S);
      outerShape.lineTo(outerLen * 0.62, -0.6 * S);
      outerShape.lineTo(outerLen * 0.28, -0.72 * S);
      outerShape.lineTo(0, -0.55 * S);
      outerShape.lineTo(0, 0.1 * S);
      const outerFlat = new THREE.Group();
      outerFlat.rotation.x = Math.PI / 2;
      const outer = new THREE.Mesh(new THREE.ShapeGeometry(outerShape), membraneMat);
      outer.scale.x = side;
      outerFlat.add(outer);
      for (const [fx, fy] of [[outerLen * 0.55, 0], [outerLen, -0.25 * S], [outerLen * 0.62, -0.6 * S]]) {
        const len = Math.hypot(fx, fy);
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * S, 0.02 * S, len, 4), bodyMat);
        finger.position.set(side * fx / 2, fy / 2, 0.01);
        finger.rotation.z = Math.atan2(fy, side * fx) + Math.PI / 2;
        outerFlat.add(finger);
      }
      elbow.add(outerFlat);
      shoulder.add(elbow);
      wingAnchor.add(shoulder);
      dragon.wings.push({ shoulder, elbow, side });
    }
    dragon.anchors.wings = wingAnchor;

    // tucked legs
    for (const [t, key] of [[0.3, 'front'], [0.52, 'hind']]) {
      const anchor = mkAnchor(t);
      for (const side of [-1, 1]) {
        const r = Critters.radiusProfile(t, S);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.4 * S, 0.2 * S), bodyMat);
        upper.position.set(side * r * 0.8, -r * 0.55, 0.1 * S);
        upper.rotation.x = 0.9;
        anchor.add(upper);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07 * S, 0.22 * S, 4), boneMat);
        claw.position.set(side * r * 0.8, -r * 0.85, 0.32 * S);
        claw.rotation.x = 1.7;
        anchor.add(claw);
      }
      dragon.anchors[key] = anchor;
    }

    // spine spikes riding the back
    for (let i = 0; i < 10; i++) {
      const t = 0.06 + i * 0.085;
      const anchor = mkAnchor(t);
      const r = Critters.radiusProfile(t, S);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.26, r * 1.0, 4), boneMat);
      spike.position.y = r * 0.98;
      spike.rotation.x = -0.35;
      anchor.add(spike);
      dragon.spikes.push(anchor);
    }

    // tail fin
    const finAnchor = mkAnchor(0.995);
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.5 * S, 0.35 * S);
    finShape.lineTo(1.05 * S, 0);
    finShape.lineTo(0.5 * S, -0.35 * S);
    finShape.lineTo(0, 0);
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape), membraneMat);
    fin.rotation.y = -Math.PI / 2; // vertical, sweeping back from the tail tip
    finAnchor.add(fin);
    dragon.anchors.fin = finAnchor;

    Critters.group.add(root);
    return dragon;
  }

  static _v1 = new THREE.Vector3();
  static _v2 = new THREE.Vector3();
  static _tan = new THREE.Vector3();
  static _x = new THREE.Vector3();
  static _y = new THREE.Vector3();
  static _prevX = new THREE.Vector3();
  static _up = new THREE.Vector3(0, 1, 0);

  static update(t, dt) {
    for (const m of Critters.mixers) m.update(dt);

    // birds
    for (const flock of Critters.flocks) {
      for (const bird of flock.birds) {
        const a = t * flock.speed + bird.userData.offset;
        const x = flock.center[0] + Math.cos(a) * flock.r;
        const z = flock.center[2] + Math.sin(a) * flock.r * 0.62;
        const y = flock.center[1] + Math.sin(t * 1.1 + bird.userData.offset * 3) * 0.8;
        bird.position.set(x, y, z);
        const vx = -Math.sin(a) * flock.r;
        const vz = Math.cos(a) * flock.r * 0.62;
        bird.rotation.y = Math.atan2(vx, vz);
        bird.rotation.z = 0.22;
      }
    }

    // premium GLB dragons (if present) — fly the same paths
    if (Critters.glbDragons) {
      for (const d of Critters.glbDragons) {
        const u = t * d.cfg.speed;
        d.cfg.path(u, Critters._v1);
        d.wrapper.position.copy(Critters._v1);
        d.cfg.path(u + 0.05 * Math.sign(d.cfg.speed || 1), Critters._v2);
        d.wrapper.lookAt(Critters._v2);
      }
      return;
    }

    // procedural dragons
    for (const d of Critters.dragons) {
      const dir = Math.sign(d.cfg.speed || 1);
      const u = t * d.cfg.speed;
      const step = d.cfg.span / (d.ctrl.length - 1);
      for (let i = 0; i < d.ctrl.length; i++) {
        d.cfg.path(u - i * step * dir, d.ctrl[i]);
      }

      // head
      const headPos = d.curve.getPoint(0);
      d.head.position.copy(headPos);
      d.cfg.path(u + 0.05 * dir, Critters._v2);
      d.head.lookAt(Critters._v2);
      d.jaw.rotation.x = 0.05 + Math.max(0, Math.sin(t * 0.5 + 1)) * 0.25;

      // rebuild the body tube along the curve
      const pos = d.tube.geometry.attributes.position.array;
      const nor = d.tube.geometry.attributes.normal.array;
      Critters._prevX.set(0, 0, 0);
      for (let i = 0; i < TUBE_N; i++) {
        const tt = i / (TUBE_N - 1);
        d.curve.getPoint(tt, Critters._v1);
        d.curve.getTangent(tt, Critters._tan);
        Critters._x.crossVectors(Critters._up, Critters._tan);
        if (Critters._x.lengthSq() < 0.05 && Critters._prevX.lengthSq() > 0.5) {
          // near-vertical tangent: carry the previous ring's frame,
          // re-orthogonalized, instead of collapsing
          Critters._x.copy(Critters._prevX)
            .addScaledVector(Critters._tan, -Critters._prevX.dot(Critters._tan));
        }
        if (Critters._x.lengthSq() < 1e-6) Critters._x.set(1, 0, 0);
        Critters._x.normalize();
        Critters._prevX.copy(Critters._x);
        Critters._y.crossVectors(Critters._tan, Critters._x).normalize();
        const r = Critters.radiusProfile(tt, d.cfg.scale);
        for (let j = 0; j < TUBE_R; j++) {
          const theta = (j / TUBE_R) * Math.PI * 2;
          const cx = Math.cos(theta), sy = Math.sin(theta);
          const k = (i * TUBE_R + j) * 3;
          nor[k] = Critters._x.x * cx + Critters._y.x * sy;
          nor[k + 1] = Critters._x.y * cx + Critters._y.y * sy;
          nor[k + 2] = Critters._x.z * cx + Critters._y.z * sy;
          pos[k] = Critters._v1.x + nor[k] * r;
          pos[k + 1] = Critters._v1.y + nor[k + 1] * r;
          pos[k + 2] = Critters._v1.z + nor[k + 2] * r;
        }
      }
      d.tube.geometry.attributes.position.needsUpdate = true;
      d.tube.geometry.attributes.normal.needsUpdate = true;

      // anchors ride the curve, facing toward the head
      const orient = (anchor) => {
        const ta = anchor.userData.t;
        d.curve.getPoint(ta, Critters._v1);
        anchor.position.copy(Critters._v1);
        d.curve.getPoint(Math.max(0, ta - 0.06), Critters._v2);
        anchor.lookAt(Critters._v2);
      };
      orient(d.anchors.wings);
      orient(d.anchors.front);
      orient(d.anchors.hind);
      orient(d.anchors.fin);
      for (const s of d.spikes) orient(s);

      // two-bone wing flap
      const flap = Math.sin(t * 2.7);
      const flapLag = Math.sin(t * 2.7 - 0.55);
      for (const w of d.wings) {
        w.shoulder.rotation.z = w.side * (0.3 + flap * 0.55);
        w.elbow.rotation.z = w.side * (flapLag * 0.5 - 0.1);
      }
    }
  }
}
