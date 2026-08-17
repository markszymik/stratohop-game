// Keyboard + mouse input. Static, simple, one global state.
export class Input {
  static keys = {};
  static just = {};   // keys that went down this frame (edge detection)
  static mouseDX = 0;
  static mouseDY = 0;
  static wheel = 0;
  static dragging = false;

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
