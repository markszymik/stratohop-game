import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { NameTag } from './NameTag.js';

// ---------------------------------------------------------------------------
// Remote players ("ghosts"): same KayKit characters, positions interpolated
// between the last received network states, animation names applied directly.
// Client-authoritative — we just render what each player says about itself.
// ---------------------------------------------------------------------------
const RENDER_DELAY = 0.15; // seconds behind live for smooth interpolation

export class Ghosts {
  static scene = null;
  static ghosts = new Map();   // memberId → ghost record
  static gltfCache = new Map(); // character → Promise<gltf>

  static init(scene) {
    Ghosts.scene = scene;
  }

  static loadCharacter(character) {
    if (!Ghosts.gltfCache.has(character)) {
      Ghosts.gltfCache.set(character,
        new GLTFLoader().loadAsync(`./assets/${character}.glb`));
    }
    return Ghosts.gltfCache.get(character);
  }

  static async add(id, info = {}) {
    if (Ghosts.ghosts.has(id) || !Ghosts.scene) return;
    const character = info.character || 'Knight';
    const record = {
      id, name: info.name || 'Player', character,
      group: null, mixer: null, actions: {}, current: null,
      nameSprite: null, buf: [], facing: 0,
    };
    Ghosts.ghosts.set(id, record);

    let gltf;
    try {
      gltf = await Ghosts.loadCharacter(character);
    } catch (e) {
      console.warn('ghost model load failed', character, e);
      Ghosts.ghosts.delete(id);
      return;
    }
    if (!Ghosts.ghosts.has(id)) return; // removed while loading

    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    const bbox = new THREE.Box3().setFromObject(gltf.scene);
    model.scale.setScalar(1.7 / Math.max(bbox.max.y - bbox.min.y, 0.001));
    model.visible = false; // until the first state arrives

    record.group = model;
    record.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      record.actions[clip.name] = record.mixer.clipAction(clip);
    }
    for (const name of ['Jump_Start', 'Jump_Land', 'Death_A']) {
      if (record.actions[name]) {
        record.actions[name].setLoop(THREE.LoopOnce);
        record.actions[name].clampWhenFinished = true;
      }
    }
    record.nameSprite = NameTag.make(record.name);
    record.nameSprite.visible = false;
    Ghosts.scene.add(model);
    Ghosts.scene.add(record.nameSprite);
  }

  static remove(id) {
    const g = Ghosts.ghosts.get(id);
    if (!g) return;
    Ghosts.ghosts.delete(id);
    if (g.group) Ghosts.scene.remove(g.group);
    if (g.nameSprite) {
      Ghosts.scene.remove(g.nameSprite);
      g.nameSprite.material.map.dispose();
      g.nameSprite.material.dispose();
    }
  }

  static removeAll() {
    for (const id of [...Ghosts.ghosts.keys()]) Ghosts.remove(id);
  }

  static applyState(id, s) {
    const g = Ghosts.ghosts.get(id);
    if (!g) return;
    g.buf.push({ rt: performance.now() / 1000, s });
    if (g.buf.length > 6) g.buf.shift();
  }

  static play(g, name, fade = 0.15) {
    const action = g.actions[name];
    if (!action || g.current === name) return;
    action.reset().fadeIn(fade).play();
    if (g.current && g.actions[g.current]) g.actions[g.current].fadeOut(fade);
    g.current = name;
  }

  static update(dt) {
    const renderT = performance.now() / 1000 - RENDER_DELAY;
    for (const g of Ghosts.ghosts.values()) {
      if (!g.group || g.buf.length === 0) continue;
      if (g.mixer) g.mixer.update(dt);

      // find the two states straddling renderT
      let a = g.buf[0], b = g.buf[g.buf.length - 1];
      for (let i = 0; i < g.buf.length - 1; i++) {
        if (g.buf[i].rt <= renderT && g.buf[i + 1].rt >= renderT) {
          a = g.buf[i]; b = g.buf[i + 1];
          break;
        }
      }
      const span = b.rt - a.rt;
      const f = span > 0.001 ? THREE.MathUtils.clamp((renderT - a.rt) / span, 0, 1) : 1;

      g.group.visible = true;
      g.nameSprite.visible = true;
      g.group.position.set(
        a.s.x + (b.s.x - a.s.x) * f,
        a.s.y + (b.s.y - a.s.y) * f,
        a.s.z + (b.s.z - a.s.z) * f
      );
      // shortest-path yaw interpolation
      let diff = b.s.f - a.s.f;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.group.rotation.y = a.s.f + diff * f;

      if (b.s.a) Ghosts.play(g, b.s.a);
      g.nameSprite.position.set(
        g.group.position.x, g.group.position.y + 2.25, g.group.position.z);
    }
  }

  static count() { return Ghosts.ghosts.size; }
}
