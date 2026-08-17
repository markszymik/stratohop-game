import * as THREE from 'three';
import { Input } from './Input.js';

// ---------------------------------------------------------------------------
// Third-person orbit camera: drag to look, wheel to zoom, damped follow.
// ---------------------------------------------------------------------------
export class CameraRig {
  static yaw = 0;            // camera behind the player, looking down-course (-Z)
  static pitch = 0.3;
  static distance = 7;
  static target = new THREE.Vector3();
  static camera = null;

  static init(camera) {
    CameraRig.camera = camera;
  }

  static update(dt, playerPos) {
    const m = Input.consumeMouse();
    CameraRig.yaw -= m.dx * 0.005;
    CameraRig.pitch = THREE.MathUtils.clamp(CameraRig.pitch + m.dy * 0.004, -0.2, 1.2);
    CameraRig.distance = THREE.MathUtils.clamp(CameraRig.distance + m.wheel * 0.01, 3.5, 13);

    const focus = playerPos.clone().add(new THREE.Vector3(0, 1.6, 0));
    CameraRig.target.lerp(focus, Math.min(1, 10 * dt));

    const d = CameraRig.distance;
    const offset = new THREE.Vector3(
      Math.sin(CameraRig.yaw) * Math.cos(CameraRig.pitch),
      Math.sin(CameraRig.pitch),
      Math.cos(CameraRig.yaw) * Math.cos(CameraRig.pitch)
    ).multiplyScalar(d);

    CameraRig.camera.position.copy(CameraRig.target).add(offset);
    CameraRig.camera.lookAt(CameraRig.target);
  }
}
