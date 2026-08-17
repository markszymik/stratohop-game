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
  }

  static setTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, '0');
    UI.el('hud-timer').textContent = `⏱️ ${m}:${s}`;
  }

  static setMapName(name) {
    UI.el('hud-map').textContent = `🗺️ ${name}`;
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
