import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './Input.js';
import { Level } from './Level.js';
import { NameTag } from './NameTag.js';

// ---------------------------------------------------------------------------
// Third-person character controller. Custom AABB physics (no engine needed
// for an obby). pos = feet position. Camera-relative movement, Roblox style.
// ---------------------------------------------------------------------------
export class Player {
  // --- movement tuning ---
  static SPEED = 7;
  static JUMP = 9.8;
  static GRAVITY = 26;        // gravity while rising
  static FALL_MULT = 1.75;    // fall faster than you rise (snappy, game-feel standard)
  static JUMP_CUT = 2.4;      // extra gravity while rising with Space released (tap = short hop)
  static APEX_WINDOW = 2.0;   // |vy| below this = apex → floatier, more air control
  static APEX_MULT = 0.55;    // gravity multiplier inside the apex window
  static MAX_FALL = 26;
  static STEP_UP = 0.3;       // ledge forgiveness: clip a step's lip while falling → land on it
  static HALF = new THREE.Vector3(0.35, 0.85, 0.35); // half extents, y = half height
  static COYOTE = 0.12;
  static BUFFER = 0.14;

  static model = null;
  static mixer = null;
  static actions = {};
  static current = null;

  static pos = new THREE.Vector3();
  static vel = new THREE.Vector3();
  static facing = 0;
  static grounded = false;
  static groundPlatform = null;
  static coyoteTimer = 0;
  static bufferTimer = 0;
  static dead = false;
  static won = false;
  static spawnPoint = new THREE.Vector3(0, 0.2, 0);

  static nameSprite = null;
  static name = 'Player';

  static setName(scene, name) {
    Player.name = name;
    if (Player.nameSprite) {
      scene.remove(Player.nameSprite);
      Player.nameSprite.material.map.dispose();
      Player.nameSprite.material.dispose();
    }
    Player.nameSprite = NameTag.make(name);
    scene.add(Player.nameSprite);
  }

  static async load(scene, characterName) {
    if (Player.model) {
      // switching character: drop the old model
      scene.remove(Player.model);
      Player.mixer.stopAllAction();
      Player.actions = {};
      Player.current = null;
      Player.model = null;
    }
    Player.character = characterName;
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`./assets/${characterName}.glb`);
    const model = gltf.scene;

    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });

    // normalize height to ~1.7 units
    const bbox = new THREE.Box3().setFromObject(model);
    const height = bbox.max.y - bbox.min.y;
    const scale = 1.7 / height;
    model.scale.setScalar(scale);
    Player.baseScale = scale;
    Player.squash = 1;

    Player.model = model;
    Player.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      Player.actions[clip.name] = Player.mixer.clipAction(clip);
    }
    for (const name of ['Jump_Start', 'Jump_Land', 'Death_A']) {
      if (Player.actions[name]) {
        Player.actions[name].setLoop(THREE.LoopOnce);
        Player.actions[name].clampWhenFinished = true;
      }
    }
    scene.add(model);
    Player.respawn(true);
    Player.play('Idle');
  }

  static play(name, fade = 0.18) {
    const action = Player.actions[name];
    if (!action || Player.current === name) return;
    action.reset().fadeIn(fade).play();
    if (Player.current && Player.actions[Player.current]) {
      Player.actions[Player.current].fadeOut(fade);
    }
    Player.current = name;
  }

  static respawn(hard = false) {
    Player.pos.copy(Player.spawnPoint);
    Player.vel.set(0, 0, 0);
    Player.dead = false;
    Player.grounded = false;
    Player.groundPlatform = null;
    if (hard) Player.facing = Math.PI; // face down-course (-Z)
    Player.play('Idle', 0.05);
    Player.syncModel();
  }

  static die() {
    if (Player.dead || Player.won) return;
    Player.dead = true;
    Player.deathTimer = 1.0;
    Player.play('Death_A', 0.08);
  }

  static win() {
    if (Player.won) return;
    Player.won = true;
    Player.vel.set(0, 0, 0);
    Player.play('Cheer', 0.2);
  }

  static update(dt, cameraYaw) {
    if (!Player.model) return;
    Player.mixer.update(dt);

    if (Player.dead) {
      Player.deathTimer -= dt;
      if (Player.deathTimer <= 0) Player.respawn();
      return;
    }
    if (Player.won) { Player.syncModel(dt); return; }

    // --- input → desired velocity (camera relative) ---
    let ix = 0, iz = 0;
    if (Input.down('KeyW') || Input.down('ArrowUp')) iz -= 1;
    if (Input.down('KeyS') || Input.down('ArrowDown')) iz += 1;
    if (Input.down('KeyA') || Input.down('ArrowLeft')) ix -= 1;
    if (Input.down('KeyD') || Input.down('ArrowRight')) ix += 1;
    if (Input.down('KeyR')) { Player.die(); return; }

    // analog touch stick takes over when active (magnitude scales speed)
    const tm = Input.touchMove;
    const tMag = Math.hypot(tm.x, tm.z);
    if (tMag > 0.12) {
      ix = tm.x / tMag;
      iz = tm.z / tMag;
    }
    const moving = ix !== 0 || iz !== 0;
    let wishX = 0, wishZ = 0;
    if (moving) {
      const len = Math.hypot(ix, iz);
      ix /= len; iz /= len;
      const speed = Player.SPEED * (tMag > 0.12 ? Math.min(tMag, 1) : 1);
      // rotate camera-space input into world space (R_y(yaw)):
      // camera right = (cos, 0, -sin), camera forward = (-sin, 0, -cos)
      const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
      wishX = (ix * cos + iz * sin) * speed;
      wishZ = (-ix * sin + iz * cos) * speed;
    }
    // snappy accel / decel; extra air control around the jump apex
    const atApex = !Player.grounded && Math.abs(Player.vel.y) < Player.APEX_WINDOW;
    const accel = Player.grounded ? 14 : (atApex ? 11 : 7);
    Player.vel.x += (wishX - Player.vel.x) * Math.min(1, accel * dt);
    Player.vel.z += (wishZ - Player.vel.z) * Math.min(1, accel * dt);

    // --- jumping: coyote time + input buffer + hold-to-bounce ---
    Player.coyoteTimer = Player.grounded ? Player.COYOTE : Player.coyoteTimer - dt;
    Player.bufferTimer -= dt;
    if (Input.justDown('Space')) Player.bufferTimer = Player.BUFFER;
    const wantsJump = Player.bufferTimer > 0 || (Input.down('Space') && Player.grounded);
    if (wantsJump && Player.coyoteTimer > 0) {
      Player.vel.y = Player.JUMP;
      Player.grounded = false;
      Player.coyoteTimer = 0;
      Player.bufferTimer = 0;
      Player.setSquash(1.25); // stretch on take-off
      Player.play('Jump_Start', 0.06);
    }

    // --- gravity: asymmetric + jump cut + apex hang ---
    let g = Player.GRAVITY;
    if (Player.vel.y < 0) {
      g *= Player.FALL_MULT;                       // falling: heavier
    } else if (!Input.down('Space')) {
      g *= Player.JUMP_CUT;                        // rising, button released: cut the jump short
    }
    if (atApex) g *= Player.APEX_MULT;             // hang time at the top of the arc
    Player.vel.y -= g * dt;
    Player.vel.y = Math.max(Player.vel.y, -Player.MAX_FALL);

    // --- ride moving platforms ---
    if (Player.groundPlatform) Player.pos.add(Player.groundPlatform.delta);

    // --- integrate + resolve, axis by axis ---
    const wasGrounded = Player.grounded;
    const fallSpeed = -Player.vel.y; // captured before landing zeroes it
    Player.moveAxis('x', Player.vel.x * dt);
    Player.moveAxis('z', Player.vel.z * dt);
    Player.grounded = false;
    Player.groundPlatform = null;
    Player.moveAxis('y', Player.vel.y * dt);

    // landing squash, harder falls squash more
    if (!wasGrounded && Player.grounded && fallSpeed > 3) {
      Player.setSquash(Math.max(0.72, 0.95 - fallSpeed * 0.012));
    }

    // --- facing follows horizontal velocity ---
    const hSpeed = Math.hypot(Player.vel.x, Player.vel.z);
    if (hSpeed > 0.8) {
      const target = Math.atan2(Player.vel.x, Player.vel.z);
      let diff = target - Player.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      Player.facing += diff * Math.min(1, 12 * dt);
    }

    // --- animation state ---
    if (Player.grounded) {
      if (!wasGrounded && Player.actions['Jump_Land']) Player.play('Jump_Land', 0.05);
      else if (hSpeed > 0.8) Player.play('Running_A');
      else if (Player.current !== 'Jump_Land' || !Player.actions['Jump_Land'].isRunning()) Player.play('Idle');
    } else if (Player.vel.y < -1 || (Player.current !== 'Jump_Start' && !Player.grounded)) {
      if (Player.current !== 'Jump_Start' || !Player.actions['Jump_Start'].isRunning()) {
        Player.play('Jump_Idle');
      }
    }

    // --- hazards & triggers ---
    if (Player.pos.y < Level.CLOUD_Y + 0.25) Player.die();

    for (const c of Level.checkpoints) {
      if (!c.reached && Player.pos.distanceTo(c.pos) < 1.8) {
        c.reached = true;
        c.mesh.material.color.setHex(0x9adfff);
        c.mesh.material.emissive.setHex(0x1b6fa8);
        Player.spawnPoint.copy(c.pos).y += 0.3; // drop in from slightly above the pad
        Player.onCheckpoint && Player.onCheckpoint(Level.checkpoints.indexOf(c) + 1);
      }
    }
    if (Level.finish && Player.pos.distanceTo(Level.finish.pos) < Level.finish.radius) {
      Player.win();
      Player.onWin && Player.onWin();
    }

    // red killbricks — touch = death (hitboxes shrunk 0.1 to feel fair)
    const cx2 = Player.pos.x, cy2 = Player.pos.y + Player.HALF.y, cz2 = Player.pos.z;
    for (const hz of Level.hazards) {
      if (hz.type === 'box') {
        const m = hz.mesh.position;
        if (Math.abs(cx2 - m.x) < Player.HALF.x + hz.half.x - 0.1 &&
            Math.abs(cy2 - m.y) < Player.HALF.y + hz.half.y - 0.1 &&
            Math.abs(cz2 - m.z) < Player.HALF.z + hz.half.z - 0.1) {
          Player.die();
          break;
        }
      } else if (hz.type === 'spinner') {
        const g = hz.group.position;
        if (Math.abs(cy2 - g.y) < Player.HALF.y + 0.21 - 0.05) {
          // into the bar's rotating frame (OBB test)
          const dx = cx2 - g.x, dz = cz2 - g.z;
          const cos = Math.cos(-hz.angle), sin = Math.sin(-hz.angle);
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          if (Math.abs(lx) < hz.len + Player.HALF.x - 0.1 &&
              Math.abs(lz) < 0.275 + Player.HALF.z - 0.1) {
            Player.die();
            break;
          }
        }
      }
    }

    Player.syncModel(dt);
  }

  // Move along one axis and resolve collisions against platform AABBs.
  static moveAxis(axis, amount) {
    Player.pos[axis] += amount;
    const h = Player.HALF;
    const cx = Player.pos.x, cy = Player.pos.y + h.y, cz = Player.pos.z;

    for (const p of Level.platforms) {
      const m = p.mesh.position, ph = p.half;
      const ox = (h.x + ph.x) - Math.abs(cx - m.x);
      const oy = (h.y + ph.y) - Math.abs(cy - m.y);
      const oz = (h.z + ph.z) - Math.abs(cz - m.z);
      if (ox <= 0 || oy <= 0 || oz <= 0) continue; // no overlap
      // Standing puts feet EXACTLY at platform top; float error can make the
      // vertical overlap ~1e-16 "positive", and the horizontal pass would then
      // eject the player sideways off the platform. Surface contact is not a
      // wall hit — require real vertical penetration for horizontal resolution.
      if (axis !== 'y' && oy <= 0.02) continue;

      if (axis === 'y') {
        if (amount <= 0 && cy > m.y) {
          // landed on top
          Player.pos.y = m.y + ph.y;
          Player.vel.y = 0;
          Player.grounded = true;
          Player.groundPlatform = p;
        } else if (amount > 0) {
          // bumped head on underside
          Player.pos.y = m.y - ph.y - h.y * 2;
          Player.vel.y = 0;
        }
      } else {
        // Ledge forgiveness: falling across a step's lip, feet only just
        // below its top. A human reads that as "I landed on it" — ejecting
        // sideways here felt like being thrown off the step. Hoist to just
        // above the top and let the Y pass finish a normal landing (squash,
        // animation, groundPlatform) with forward momentum intact.
        // (airborne only — walking into a step face still blocks like a wall.
        //  MUST break after hoisting: cx/cy/cz above are stale once pos.y
        //  moves, and scanning on ejected players off adjacent stair steps.)
        const lip = (m.y + ph.y) - Player.pos.y;
        if (!Player.grounded && Player.vel.y <= 0 && lip > 0 && lip <= Player.STEP_UP) {
          Player.pos.y = m.y + ph.y + 0.02;
          break;
        }
        const sign = Player.pos[axis] > m[axis] ? 1 : -1;
        const pHalf = axis === 'x' ? ph.x : ph.z;
        const myHalf = axis === 'x' ? h.x : h.z;
        Player.pos[axis] = m[axis] + sign * (pHalf + myHalf);
        Player.vel[axis] = 0;
      }
      // recompute center for subsequent platforms
      break;
    }
  }

  static setSquash(v) { Player.squash = v; }

  static syncModel(dt = 0) {
    // squash & stretch eases back to 1 (volume-preserving-ish)
    if (dt > 0) Player.squash += (1 - Player.squash) * Math.min(1, 9 * dt);
    const b = Player.baseScale || 1;
    const sy = b * Player.squash;
    const sxz = b * (1 + (1 - Player.squash) * 0.6);
    Player.model.scale.set(sxz, sy, sxz);

    Player.model.position.copy(Player.pos);
    Player.model.rotation.y = Player.facing;

    if (Player.nameSprite) {
      Player.nameSprite.position.set(Player.pos.x, Player.pos.y + 2.25, Player.pos.z);
      Player.nameSprite.visible = !Player.dead;
    }
  }

  // Compact state for future multiplayer sync (see src/Net.js)
  static netState() {
    return {
      x: +Player.pos.x.toFixed(2), y: +Player.pos.y.toFixed(2), z: +Player.pos.z.toFixed(2),
      f: +Player.facing.toFixed(2), a: Player.current,
      n: Player.name, c: Player.character,
    };
  }
}
