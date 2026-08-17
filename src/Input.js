// Keyboard + mouse input. Static, simple, one global state.
export class Input {
  static keys = {};
  static just = {};   // keys that went down this frame (edge detection)
  static mouseDX = 0;
  static mouseDY = 0;
  static wheel = 0;
  static dragging = false;
  static touchMove = { x: 0, z: 0 }; // analog stick vector, magnitude ≤ 1
  static isTouch = typeof window !== 'undefined' &&
    (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  static init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // typing a name, not playing
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) Input.just[e.code] = true;
      Input.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { Input.keys[e.code] = false; });
    window.addEventListener('blur', () => { Input.keys = {}; Input.dragging = false; });

    canvas.addEventListener('mousedown', () => { Input.dragging = true; });
    window.addEventListener('mouseup', () => { Input.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (Input.dragging) {
        Input.mouseDX += e.movementX;
        Input.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      Input.wheel += e.deltaY;
    }, { passive: false });

    if (Input.isTouch) Input.initTouch(canvas);
  }

  // Touch controls: floating joystick (left half), camera drag (right half),
  // jump + respawn buttons. Multi-touch: each finger keeps its role.
  static initTouch(canvas) {
    const joyBase = document.getElementById('joy-base');
    const joyKnob = document.getElementById('joy-knob');
    const jumpBtn = document.getElementById('btn-jump');
    const respawnBtn = document.getElementById('btn-respawn');
    if (!joyBase) return;

    const JOY_RADIUS = 46;
    let joyId = null, joyOrigin = null;
    let camId = null, camLast = null;

    const setSpace = (down) => {
      if (down && !Input.keys.Space) Input.just.Space = true;
      Input.keys.Space = down;
    };
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setSpace(true); }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); setSpace(false); });
    jumpBtn.addEventListener('touchcancel', () => setSpace(false));
    respawnBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Input.just.KeyR = true;
      Input.keys.KeyR = true;
      setTimeout(() => { Input.keys.KeyR = false; }, 120);
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (joyId === null && t.clientX < window.innerWidth * 0.45) {
          joyId = t.identifier;
          joyOrigin = { x: t.clientX, y: t.clientY };
          joyBase.style.display = 'block';
          joyBase.style.left = `${t.clientX}px`;
          joyBase.style.top = `${t.clientY}px`;
          joyKnob.style.left = '50%';
          joyKnob.style.top = '50%';
        } else if (camId === null) {
          camId = t.identifier;
          camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - joyOrigin.x;
          let dy = t.clientY - joyOrigin.y;
          const len = Math.hypot(dx, dy);
          if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
          Input.touchMove.x = dx / JOY_RADIUS;
          Input.touchMove.z = dy / JOY_RADIUS; // screen-down = toward camera
          joyKnob.style.left = `calc(50% + ${dx}px)`;
          joyKnob.style.top = `calc(50% + ${dy}px)`;
        } else if (t.identifier === camId) {
          Input.mouseDX += t.clientX - camLast.x;
          Input.mouseDY += t.clientY - camLast.y;
          camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          Input.touchMove.x = 0;
          Input.touchMove.z = 0;
          joyBase.style.display = 'none';
        } else if (t.identifier === camId) {
          camId = null;
        }
      }
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);
  }

  static down(code) { return !!Input.keys[code]; }
  static justDown(code) { return !!Input.just[code]; }

  // Call once at the END of each frame, after all systems have read input.
  static endFrame() { Input.just = {}; }

  // Consume per-frame deltas (call once per frame).
  static consumeMouse() {
    const d = { dx: Input.mouseDX, dy: Input.mouseDY, wheel: Input.wheel };
    Input.mouseDX = 0; Input.mouseDY = 0; Input.wheel = 0;
    return d;
  }
}
