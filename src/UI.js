// ---------------------------------------------------------------------------
// HUD + overlays. Pure DOM, no framework. Kid-friendly: chunky badges,
// bouncy toasts, confetti on the win screen.
// ---------------------------------------------------------------------------
export class UI {
  static el(id) { return document.getElementById(id); }

  static pop(id) {
    const el = UI.el(id);
    el.classList.remove('pop');
    void el.offsetWidth; // restart the animation
    el.classList.add('pop');
  }

  static showHUD() {
    UI.el('hud-top').style.display = 'flex';
    UI.el('hud-hint').style.display = 'flex';
    // touch devices: show joystick/jump controls, adjust the hint
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) {
      UI.el('touch-ui').style.display = 'block';
      UI.el('hud-hint').querySelector('span').textContent =
        'Left side: move · Right side: look around · ⬆️ jump';
    }
  }

  static setTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, '0');
    UI.el('hud-timer').textContent = `⏱️ ${m}:${s}`;
  }

  static setMapName(name, index, total) {
    UI.el('hud-map').textContent = Number.isInteger(index) && total
      ? `🗺️ ${index + 1}/${total} · ${name}`
      : `🗺️ ${name}`;
  }

  // room pill: shows the code while connected; click copies the invite link
  static setRoom(code) {
    const el = UI.el('hud-room');
    if (code) {
      el.style.display = '';
      el.textContent = `🔑 ${code}`;
      UI.pop('hud-room');
    } else {
      el.style.display = 'none';
    }
  }

  // menu "open rooms" list — rows are joinable
  static setRoomList(rooms, onJoin) {
    const box = UI.el('rooms');
    if (!rooms || rooms.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = '<div class="rooms-title">🌍 Open rooms — tap to join</div>';
    for (const r of rooms.slice(0, 6)) {
      const row = document.createElement('button');
      row.className = 'room-item';
      row.innerHTML =
        `<span class="room-code">${r.code}</span>` +
        `<span class="room-map">🗺️ ${r.map || '…'}</span>` +
        `<span class="room-count">👥 ${r.count}</span>`;
      row.addEventListener('click', () => onJoin(r.code));
      box.appendChild(row);
    }
  }

  static setCheckpoint(reached, total) {
    UI.el('hud-checkpoint').textContent = `🚩 ${reached}/${total}`;
    if (reached > 0) UI.pop('hud-checkpoint');
  }

  static setPlayers(n) {
    const el = UI.el('hud-players');
    if (n > 1) {
      el.style.display = '';
      el.textContent = `👥 ${n}`;
      UI.pop('hud-players');
    } else {
      el.style.display = 'none';
    }
  }

  static setDeaths(n) {
    UI.el('hud-deaths').textContent = `😵 ${n}`;
    if (n > 0) UI.pop('hud-deaths');
  }

  static toast(msg, color = '#7CFC9A') {
    const t = UI.el('toast');
    t.textContent = msg;
    t.style.color = color;
    t.style.opacity = 1;
    t.classList.remove('bounce');
    void t.offsetWidth;
    t.classList.add('bounce');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => { t.style.opacity = 0; }, 1700);
  }

  static hideMenu() { UI.el('menu').classList.add('hidden'); }

  static showWin(seconds, deaths) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, '0');
    UI.el('win-stats').innerHTML = `
      <div class="stat"><span class="icon">⏱️</span>${m}:${s}<span class="label">TIME</span></div>
      <div class="stat"><span class="icon">${deaths === 0 ? '🌟' : '😵'}</span>${deaths}<span class="label">FALLS</span></div>
    `;
    UI.spawnConfetti();
    UI.el('win').classList.remove('hidden');
  }

  static hideWin() {
    UI.el('win').classList.add('hidden');
    UI.el('confetti').innerHTML = '';
  }

  // multiplayer: lock NEXT MAP until the whole room has finished
  static setWinWait(done, total) {
    const btn = UI.el('next-btn');
    if (total > 1 && done < total) {
      btn.disabled = true;
      btn.textContent = `⏳ WAITING FOR FRIENDS… ${done}/${total}`;
    } else {
      const wasWaiting = btn.disabled;
      btn.disabled = false;
      btn.textContent = 'NEXT MAP ▶';
      if (wasWaiting && total > 1 && !UI.el('win').classList.contains('hidden')) {
        UI.toast('Everyone made it! 🎉', '#ffd257');
      }
    }
  }

  static spawnConfetti() {
    const box = UI.el('confetti');
    box.innerHTML = '';
    const emojis = ['🎉', '⭐', '🎈', '✨', '🎊'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-piece';
      p.textContent = emojis[i % emojis.length];
      p.style.left = `${Math.random() * 100}%`;
      p.style.fontSize = `${18 + Math.random() * 18}px`;
      p.style.animationDuration = `${2.4 + Math.random() * 2.2}s`;
      p.style.animationDelay = `${Math.random() * 2.5}s`;
      box.appendChild(p);
    }
  }
}
