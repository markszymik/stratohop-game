import * as THREE from 'three';
import { Level } from './Level.js';
import { Critters } from './Critters.js';

// ---------------------------------------------------------------------------
// Renderer, scene, sky dome, sun/moon/stars, day-night cycle, cloud deck,
// drifting clouds, birds & dragon.
// ---------------------------------------------------------------------------
export class World {
  static scene = null;
  static renderer = null;
  static camera = null;
  static clouds = null;
  static sky = null;
  static stars = null;
  static sun = null;         // directional light
  static sunSprite = null;
  static moonSprite = null;
  static puffs = [];
  static motes = null;

  // --- day/night cycle: one full day every CYCLE seconds -------------------
  static CYCLE = 180;
  static phaseOffset = 0; // per-map start time of day (theme.phase)
  static DAY_KEYS = [
    { t: 0.00, skyTop: 0x2f7fd0, skyHorizon: 0xbfe0f2, sun: 0xfff4dd, cloudL: 0xffffff, cloudS: 0x9db8d6, sunI: 2.4, hemiI: 0.85, night: 0.0 },  // midday
    { t: 0.26, skyTop: 0x4a5fae, skyHorizon: 0xffc878, sun: 0xffb040, cloudL: 0xffe0b0, cloudS: 0xab7f88, sunI: 1.8, hemiI: 0.65, night: 0.05 }, // golden hour
    { t: 0.38, skyTop: 0x2c2560, skyHorizon: 0xe2734c, sun: 0xff8a40, cloudL: 0xe8a888, cloudS: 0x6f5578, sunI: 1.2, hemiI: 0.5,  night: 0.3 },  // sunset
    { t: 0.48, skyTop: 0x070b22, skyHorizon: 0x1a2244, sun: 0xa8c0ff, cloudL: 0x6a78a8, cloudS: 0x323e60, sunI: 0.35, hemiI: 0.3, night: 1.0 },  // night
    { t: 0.64, skyTop: 0x070b22, skyHorizon: 0x1a2244, sun: 0xa8c0ff, cloudL: 0x6a78a8, cloudS: 0x323e60, sunI: 0.35, hemiI: 0.3, night: 1.0 },  // deep night
    { t: 0.74, skyTop: 0x3a4a8c, skyHorizon: 0xe8b088, sun: 0xffd0a0, cloudL: 0xd8b8a8, cloudS: 0x5f5a80, sunI: 1.0, hemiI: 0.5,  night: 0.4 },  // dawn
    { t: 0.86, skyTop: 0x4a90cc, skyHorizon: 0xd8e8f0, sun: 0xfff0d0, cloudL: 0xfff4e4, cloudS: 0x9fb4cc, sunI: 2.0, hemiI: 0.75, night: 0.0 },  // morning
    { t: 1.00, skyTop: 0x2f7fd0, skyHorizon: 0xbfe0f2, sun: 0xfff4dd, cloudL: 0xffffff, cloudS: 0x9db8d6, sunI: 2.4, hemiI: 0.85, night: 0.0 },  // midday again
  ];

  static init(container) {
    World.renderer = new THREE.WebGLRenderer({ antialias: true });
    World.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    World.renderer.setSize(window.innerWidth, window.innerHeight);
    World.renderer.shadowMap.enabled = true;
    World.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    World.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    World.renderer.toneMappingExposure = 1.05;
    container.appendChild(World.renderer.domElement);

    World.scene = new THREE.Scene();
    World.scene.background = new THREE.Color(0x87c5eb);
    World.scene.fog = new THREE.Fog(0xbfe0f2, 55, 175);

    World.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 700);
    World.camera.position.set(0, 4, 8);

    World.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xf2ede2, 0.85);
    World.scene.add(World.hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(12, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    const s = 22;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    World.scene.add(sun);
    World.scene.add(sun.target);
    World.sun = sun;

    World.bounce = new THREE.DirectionalLight(0xdfeaff, 0.5);
    World.bounce.position.set(0, -1, 0);
    World.scene.add(World.bounce);

    // parse key colors once
    for (const k of World.DAY_KEYS) {
      k.cSkyTop = new THREE.Color(k.skyTop);
      k.cSkyHorizon = new THREE.Color(k.skyHorizon);
      k.cSun = new THREE.Color(k.sun);
      k.cCloudL = new THREE.Color(k.cloudL);
      k.cCloudS = new THREE.Color(k.cloudS);
    }

    World.buildSky();
    World.buildStars();
    World.buildSunSprite();
    World.buildMoonSprite();
    World.buildCloudFloor();
    World.buildPuffs();
    World.buildMotes();
    Critters.init(World.scene);

    window.addEventListener('resize', () => {
      World.camera.aspect = window.innerWidth / window.innerHeight;
      World.camera.updateProjectionMatrix();
      World.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  static buildSky() {
    const geo = new THREE.SphereGeometry(320, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3d8fd6) },
        uHorizon: { value: new THREE.Color(0xbfe0f2) },
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y, 0.0, 1.0);
          gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.55)), 1.0);
        }
      `,
    });
    World.sky = new THREE.Mesh(geo, mat);
    World.scene.add(World.sky);
  }

  // stars live on the sky dome, fade in at night
  static buildStars() {
    const count = 380;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random point on upper hemisphere, radius just inside the dome
      const theta = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.88;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(theta) * r * 310;
      pos[i * 3 + 1] = y * 310;
      pos[i * 3 + 2] = Math.sin(theta) * r * 310;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, transparent: true, opacity: 0,
      fog: false, depthWrite: false, sizeAttenuation: false,
    });
    mat.size = 1.6;
    World.stars = new THREE.Points(geo, mat);
    World.sky.add(World.stars); // follows the camera with the dome
  }

  static makeGlowTexture(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  static buildSunSprite() {
    const tex = World.makeGlowTexture([
      [0.0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,244,214,0.95)'],
      [0.45, 'rgba(255,220,150,0.35)'],
      [1.0, 'rgba(255,220,150,0)'],
    ]);
    World.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
    }));
    World.sunSprite.scale.set(90, 90, 1);
    World.sunOffset = new THREE.Vector3(-55, 130, -250);
    World.scene.add(World.sunSprite);
  }

  static buildMoonSprite() {
    const tex = World.makeGlowTexture([
      [0.0, 'rgba(235,240,255,1)'],
      [0.25, 'rgba(210,220,250,0.9)'],
      [0.32, 'rgba(180,195,240,0.25)'],
      [1.0, 'rgba(180,195,240,0)'],
    ]);
    World.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    }));
    World.moonSprite.scale.set(42, 42, 1);
    World.moonOffset = new THREE.Vector3(70, 120, 230); // opposite side of the sky
    World.scene.add(World.moonSprite);
  }

  static buildCloudFloor() {
    const geo = new THREE.PlaneGeometry(700, 700, 130, 130);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShadow: { value: new THREE.Color(0x9db8d6) },
        uLight: { value: new THREE.Color(0xffffff) },
        uSunDir: { value: new THREE.Vector3(0.42, 0.78, 0.46).normalize() },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        varying float vBump;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }
        void main() {
          vUv = uv;
          vec3 pos = position;
          // big billowing forms + medium detail, drifting on the wind
          float n = noise(uv * 12.0 + uTime * 0.022) * 0.7
                  + noise(uv * 34.0 - uTime * 0.015) * 0.3;
          pos.z += n * 2.6 - 0.7;
          vBump = n;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uShadow;
        uniform vec3 uLight;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying float vBump;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
          return v;
        }
        void main() {
          // domain-warped cloud field, drifting slowly
          vec2 p = vUv * 30.0 + vec2(uTime * 0.045, uTime * 0.012);
          float warp = fbm(p * 0.5 - uTime * 0.02);
          float n  = fbm(p + warp * 1.6);
          // cheap lit normal from the noise gradient → sun highlights &
          // shaded crevices instead of flat mottling
          vec2 e = vec2(0.22, 0.0);
          float nx = fbm(p - e.xy + warp * 1.6) - fbm(p + e.xy + warp * 1.6);
          float nz = fbm(p - e.yx + warp * 1.6) - fbm(p + e.yx + warp * 1.6);
          vec3 nrm = normalize(vec3(nx * 2.6, 0.6, nz * 2.6));
          float diff = clamp(dot(nrm, normalize(uSunDir)), 0.0, 1.0);
          float shape = smoothstep(0.28, 0.85, n + vBump * 0.35);
          float lit = shape * (0.35 + diff * 0.65);
          vec3 col = mix(uShadow, uLight, lit);
          // faint cool tint pooled in the deepest crevices
          col = mix(uShadow * 0.85, col, smoothstep(0.1, 0.45, n));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    World.clouds = new THREE.Mesh(geo, mat);
    World.clouds.rotation.x = -Math.PI / 2;
    World.clouds.position.y = Level.CLOUD_Y;
    World.scene.add(World.clouds);
  }

  // cloud textures: round puffs, flat-bottomed bases, stretched wisps
  static makeCloudTexture(kind = 'puff') {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const blob = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(255,255,255,${a * 0.42})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    };
    if (kind === 'wisp') {
      // long horizontal streaks (cirrus)
      for (let i = 0; i < 14; i++) {
        const y = 96 + Math.random() * 64;
        const x = 40 + Math.random() * 176;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(3.2, 0.55);
        ctx.translate(-x, -y);
        blob(x, y, 20 + Math.random() * 26, 0.5);
        ctx.restore();
      }
    } else {
      // cauliflower cluster: smaller blobs near the top, bigger low
      for (let i = 0; i < 44; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * 46;
        const x = 128 + Math.cos(a) * rr * 1.15;
        const y = 138 + Math.sin(a) * rr * 0.45;
        const shrink = 1 - (138 - y) / 138 * 0.35; // higher blobs smaller
        blob(x, y, (34 + Math.random() * 46) * shrink, 0.9);
      }
      if (kind === 'base') {
        // shave a soft flat bottom
        const g = ctx.createLinearGradient(0, 168, 0, 208);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = g;
        ctx.fillRect(0, 168, 256, 88);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 2;
    return tex;
  }

  // volumetric-looking clouds: layered billboard clusters — flat shaded
  // bases, round mid volume, bright cauliflower crowns; plus cirrus wisps.
  static buildPuffs() {
    const rng = (a, b) => a + Math.random() * (b - a);
    const puffTex = [World.makeCloudTexture(), World.makeCloudTexture(), World.makeCloudTexture()];
    const baseTex = [World.makeCloudTexture('base'), World.makeCloudTexture('base')];
    const wispTex = World.makeCloudTexture('wisp');
    World.cloudSprites = []; // { mat, shade, baseRot, oscAmp, oscSeed }

    const addSprite = (cloud, tex, x, y, z, sx, sy, opacity, shade, oscAmp) => {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity,
        rotation: oscAmp > 0 ? rng(-0.4, 0.4) : 0,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.scale.set(sx, sy, 1);
      World.cloudSprites.push({ mat, shade, baseRot: mat.rotation, oscAmp, oscSeed: rng(0, 20) });
      cloud.add(sp);
    };

    const makeCumulus = (size) => {
      const cloud = new THREE.Group();
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      // flat shaded base row
      const bases = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < bases; k++) {
        addSprite(cloud, pick(baseTex),
          rng(-0.4, 0.4) * size, -size * 0.26, rng(-0.2, 0.2) * size,
          size * rng(1.0, 1.3), size * rng(0.5, 0.62),
          rng(0.85, 0.95), rng(0.5, 0.66), 0);
      }
      // round mid volume
      const mids = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < mids; k++) {
        addSprite(cloud, pick(puffTex),
          rng(-0.5, 0.5) * size, rng(-0.08, 0.12) * size, rng(-0.28, 0.28) * size,
          size * rng(0.8, 1.1), size * rng(0.52, 0.66),
          rng(0.8, 0.92), rng(0.24, 0.42), 0.05);
      }
      // bright crowns on top
      const crowns = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < crowns; k++) {
        addSprite(cloud, pick(puffTex),
          rng(-0.35, 0.35) * size, size * rng(0.18, 0.34), rng(-0.2, 0.2) * size,
          size * rng(0.45, 0.7), size * rng(0.3, 0.45),
          rng(0.8, 0.92), rng(0.02, 0.14), 0.09);
      }
      return cloud;
    };

    // near/mid cumulus around the course (bottoms stay above the deck)
    for (let i = 0; i < 18; i++) {
      const size = rng(4.5, 8);
      const cloud = makeCumulus(size);
      const side = Math.random() > 0.5 ? 1 : -1;
      cloud.position.set(side * rng(13, 48), rng(2.5, 16) + size * 0.3, -rng(-20, 230));
      cloud.userData = { speed: rng(0.3, 1.1), bobSeed: Math.random() * 10 };
      World.puffs.push(cloud);
      World.scene.add(cloud);
    }
    // big distant banks
    for (let i = 0; i < 8; i++) {
      const size = rng(14, 22);
      const cloud = makeCumulus(size);
      const side = Math.random() > 0.5 ? 1 : -1;
      cloud.position.set(side * rng(60, 100), rng(8, 26) + size * 0.3, -rng(-30, 250));
      cloud.userData = { speed: rng(0.15, 0.4), bobSeed: Math.random() * 10 };
      World.puffs.push(cloud);
      World.scene.add(cloud);
    }
    // high cirrus wisps
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Group();
      const size = rng(10, 20);
      for (let k = 0; k < 2; k++) {
        addSprite(cloud, wispTex,
          rng(-0.4, 0.4) * size, rng(-0.1, 0.1) * size, rng(-0.2, 0.2) * size,
          size * rng(1.6, 2.4), size * rng(0.28, 0.4),
          rng(0.3, 0.45), rng(0.05, 0.15), 0.03);
      }
      cloud.position.set(rng(-75, 75), rng(24, 44), -rng(-30, 250));
      cloud.userData = { speed: rng(0.5, 1.3), bobSeed: Math.random() * 10 };
      World.puffs.push(cloud);
      World.scene.add(cloud);
    }
  }

  static buildMotes() {
    const count = 200;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 130;
      pos[i * 3 + 1] = Level.CLOUD_Y + 2 + Math.random() * 20;
      pos[i * 3 + 2] = -Math.random() * 230 + 10;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    World.moteSeeds = seed;
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.1, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    World.motes = new THREE.Points(geo, mat);
    World.scene.add(World.motes);
  }

  // per-map: platforms colors come from the theme; the sky just starts at a
  // different time of day (theme.phase in [0,1))
  static applyTheme(theme) {
    World.phaseOffset = theme.phase ?? 0;
    World.cycleBase = null; // recompute from next update
  }

  // interpolate the day keyframes at phase p in [0,1)
  static _cycle = {
    skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), sun: new THREE.Color(),
    cloudL: new THREE.Color(), cloudS: new THREE.Color(), sunI: 1, hemiI: 1, night: 0,
  };
  static cycleAt(p) {
    const keys = World.DAY_KEYS;
    let i = 0;
    while (p > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const f = (p - a.t) / (b.t - a.t);
    const c = World._cycle;
    c.skyTop.lerpColors(a.cSkyTop, b.cSkyTop, f);
    c.skyHorizon.lerpColors(a.cSkyHorizon, b.cSkyHorizon, f);
    c.sun.lerpColors(a.cSun, b.cSun, f);
    c.cloudL.lerpColors(a.cCloudL, b.cCloudL, f);
    c.cloudS.lerpColors(a.cCloudS, b.cCloudS, f);
    c.sunI = a.sunI + (b.sunI - a.sunI) * f;
    c.hemiI = a.hemiI + (b.hemiI - a.hemiI) * f;
    c.night = a.night + (b.night - a.night) * f;
    return c;
  }

  static phaseOverride = null; // set to [0,1) to freeze the sky (tests/screenshots)

  static update(t, dt, playerPos) {
    // Wall-clock time drives the sky and cloud deck so every player in a
    // room sees the same time of day (clocks are NTP-synced; a few seconds
    // of skew is invisible over a 180 s cycle).
    const epoch = Date.now() / 1000;
    World.clouds.material.uniforms.uTime.value = epoch % 3600;

    // ---- day/night cycle ----
    const p = World.phaseOverride ??
      ((World.phaseOffset + (epoch % World.CYCLE) / World.CYCLE) % 1);
    const c = World.cycleAt(p);
    World.sky.material.uniforms.uTop.value.copy(c.skyTop);
    World.sky.material.uniforms.uHorizon.value.copy(c.skyHorizon);
    World.scene.background.copy(c.skyHorizon);
    World.scene.fog.color.copy(c.skyHorizon);
    World.clouds.material.uniforms.uLight.value.copy(c.cloudL);
    World.clouds.material.uniforms.uShadow.value.copy(c.cloudS);
    World.sun.color.copy(c.sun);
    World.sun.intensity = c.sunI;
    World.hemi.intensity = c.hemiI;
    World.hemi.color.copy(c.skyHorizon);
    World.bounce.intensity = 0.5 * (1 - c.night * 0.65);
    World.sunSprite.material.color.copy(c.sun);
    World.sunSprite.material.opacity = 1 - c.night * 0.92;
    World.moonSprite.material.opacity = Math.max(0, c.night - 0.15);
    World.stars.material.opacity = c.night * 0.9;
    // billboard clouds: lit tops → shaded undersides, following the day
    // cycle, with a slow billowing rotation on the upper sprites
    for (const cs of World.cloudSprites) {
      cs.mat.color.copy(c.cloudL).lerp(c.cloudS, cs.shade);
      if (cs.oscAmp > 0) {
        cs.mat.rotation = cs.baseRot + Math.sin(t * 0.14 + cs.oscSeed) * cs.oscAmp;
      }
    }

    // ---- particles / decor ----
    const arr = World.motes.geometry.attributes.position;
    for (let i = 0; i < arr.count; i++) {
      let y = arr.getY(i) + dt * (0.15 + World.moteSeeds[i] * 0.35);
      const x = arr.getX(i) + Math.sin(t * 0.8 + World.moteSeeds[i] * 20) * dt * 0.5;
      if (y > Level.CLOUD_Y + 24) y = Level.CLOUD_Y + 2;
      arr.setY(i, y); arr.setX(i, x);
    }
    arr.needsUpdate = true;

    for (const puff of World.puffs) {
      puff.position.x += puff.userData.speed * dt;
      if (puff.position.x > 100) puff.position.x = -100;
      puff.position.y += Math.sin(t * 0.4 + puff.userData.bobSeed) * dt * 0.05;
    }

    Critters.update(t, dt);

    // ---- follow the camera / player ----
    World.sky.position.copy(World.camera.position);
    World.sunSprite.position.copy(World.camera.position).add(World.sunOffset);
    World.moonSprite.position.copy(World.camera.position).add(World.moonOffset);
    if (playerPos) {
      World.sun.position.set(playerPos.x + 12, playerPos.y + 24, playerPos.z + 10);
      World.sun.target.position.copy(playerPos);
    }
  }
}
