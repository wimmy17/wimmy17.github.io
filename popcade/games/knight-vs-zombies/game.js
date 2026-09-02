(function () {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const scoreEl = document.getElementById("score");
  const pileEl = document.getElementById("pile");
  const goldEl = document.getElementById("gold");
  const startOverlay = document.getElementById("start-overlay");
  const startBtn = document.getElementById("start-btn");
  const swipeBtn = document.getElementById("swipe-btn");
  const cooldownCircle = document.querySelector(".cooldown-ring circle");
  const RING_CIRC = 2 * Math.PI * 19;

  const shopBtn = document.getElementById("shop-btn");
  const shopBackdrop = document.getElementById("shop-backdrop");
  const shopClose = document.getElementById("shop-close");
  const shopGoldEl = document.getElementById("shop-gold");

  const SAVE_KEY = "popcade-knight-vs-zombies-save-v2";
  const HITS_TO_KILL_BASE = 3;
  const MAX_VISIBLE_PILE = 14; // sprites drawn individually; the rest render as a mass
  const COOLDOWN_BASE_MS = 500;

  // ---------- persistent economy ----------
  const UPGRADES = {
    blade: { cost: 15, growth: 1.6, level: 0 },
    hands: { cost: 12, growth: 1.55, level: 0 },
    cleave: { cost: 25, growth: 1.8, level: 0 },
  };
  let gold = 0;

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      gold = data.gold || 0;
      for (const key of Object.keys(UPGRADES)) {
        UPGRADES[key].level = (data.levels && data.levels[key]) || 0;
      }
    } catch (e) {
      // ignore corrupt save
    }
  }

  function save() {
    const levels = {};
    for (const key of Object.keys(UPGRADES)) levels[key] = UPGRADES[key].level;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ gold, levels }));
    } catch (e) {
      // storage unavailable, ignore
    }
  }

  function upgradeCost(key) {
    const u = UPGRADES[key];
    return Math.round(u.cost * Math.pow(u.growth, u.level));
  }

  function attackDamage() {
    return 1 + UPGRADES.blade.level;
  }

  function cooldownMs() {
    return Math.max(150, COOLDOWN_BASE_MS - UPGRADES.hands.level * 60);
  }

  function cleaveTargets() {
    return 1 + UPGRADES.cleave.level;
  }

  function formatCount(n) {
    if (n < 1000) return String(n);
    const units = [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [val, suffix] of units) {
      if (n >= val) {
        const v = n / val;
        return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + suffix;
      }
    }
    return String(n);
  }

  // ---------- shop UI ----------
  function refreshShopUI() {
    shopGoldEl.textContent = formatCount(gold);
    goldEl.textContent = formatCount(gold);
    for (const key of Object.keys(UPGRADES)) {
      const cost = upgradeCost(key);
      document.getElementById(`${key}-level`).textContent = UPGRADES[key].level;
      document.getElementById(`${key}-cost`).textContent = formatCount(cost);
      document.getElementById(`buy-${key}`).disabled = gold < cost;
    }
  }

  function buy(key) {
    const cost = upgradeCost(key);
    if (gold < cost) return;
    gold -= cost;
    UPGRADES[key].level += 1;
    save();
    refreshShopUI();
  }

  document.getElementById("buy-blade").addEventListener("click", () => buy("blade"));
  document.getElementById("buy-hands").addEventListener("click", () => buy("hands"));
  document.getElementById("buy-cleave").addEventListener("click", () => buy("cleave"));

  shopBtn.addEventListener("click", () => {
    refreshShopUI();
    shopBackdrop.classList.remove("hidden");
  });
  shopClose.addEventListener("click", () => shopBackdrop.classList.add("hidden"));
  shopBackdrop.addEventListener("click", (e) => {
    if (e.target === shopBackdrop) shopBackdrop.classList.add("hidden");
  });

  // ---------- game state ----------
  let width, height, groundY, castleX, deckY;
  let walkers = [];
  let pile = [];
  let score = 0;
  let running = false;
  let spawnTimer = 0;
  let lastTs = 0;
  let cooldownUntil = 0;
  let swordSwing = 0;
  let hitFlash = 0;

  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    groundY = height * 0.84;
    castleX = width * 0.72;
    deckY = groundY - 108; // where the knight stands, atop the wall
  }
  window.addEventListener("resize", resize);
  resize();

  function spawnInterval() {
    return Math.max(500, 1800 - score * 20);
  }

  const SKIN_TONES = ["#7a9b6e", "#8c9e6a", "#6f8f7a", "#93926a"];
  const SHIRT_TONES = ["#4a3f2c", "#3e4a3f", "#463a4a", "#4a4635"];

  function spawnZombie() {
    walkers.push({
      x: width + 20,
      hp: HITS_TO_KILL_BASE,
      speed: 0.5 + Math.random() * 0.35,
      bob: Math.random() * Math.PI * 2,
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: SHIRT_TONES[Math.floor(Math.random() * SHIRT_TONES.length)],
      tilt: Math.random() * 0.14 - 0.07,
      lostArm: Math.random() < 0.25,
      limp: Math.random() < 0.4,
    });
  }

  function px(x) {
    return Math.round(x);
  }

  // ---------- drawing ----------
  function drawGround() {
    ctx.fillStyle = "#0f1026";
    ctx.fillRect(0, px(groundY), width, height - groundY);
    ctx.fillStyle = "rgba(245,243,237,0.06)";
    for (let x = 0; x < width; x += 24) {
      ctx.fillRect(px(x), px(groundY), 12, 3);
    }
  }

  function drawCastle() {
    const towerTop = deckY;
    const towerBottom = groundY;
    const towerW = width - castleX;

    ctx.fillStyle = "#3a3d63";
    ctx.fillRect(px(castleX), px(towerTop), px(towerW), px(towerBottom - towerTop));

    ctx.fillStyle = "#4c507f";
    for (let y = towerTop; y < towerBottom; y += 12) {
      const rowOffset = ((y - towerTop) / 12) % 2 === 0 ? 0 : 8;
      for (let x = castleX + rowOffset; x < width; x += 16) {
        ctx.fillRect(px(x), px(y), 12, 8);
      }
    }

    ctx.fillStyle = "#3a3d63";
    for (let x = castleX; x < width; x += 22) {
      ctx.fillRect(px(x), px(towerTop - 14), 12, 14);
    }

    ctx.fillStyle = "#2c2f52";
    ctx.fillRect(px(castleX - 4), px(towerTop), px(towerW + 4), 6);

    const gateW = 46;
    ctx.fillStyle = "#20223f";
    ctx.beginPath();
    ctx.moveTo(castleX + 14, towerBottom);
    ctx.lineTo(castleX + 14, towerBottom - 30);
    ctx.arc(castleX + 14 + gateW / 2, towerBottom - 30, gateW / 2, Math.PI, 0);
    ctx.lineTo(castleX + 14 + gateW, towerBottom);
    ctx.closePath();
    ctx.fill();
  }

  function drawKnight() {
    const x = castleX + 34;
    const y = deckY;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#2b2f52";
    ctx.fillRect(-10, -20, 8, 20);
    ctx.fillRect(2, -20, 8, 20);

    ctx.fillStyle = "#8a93c7";
    ctx.fillRect(-12, -46, 24, 28);

    ctx.fillStyle = "#e8c9a0";
    ctx.fillRect(-7, -60, 14, 14);
    ctx.fillStyle = "#c9cbe0";
    ctx.fillRect(-9, -62, 18, 8);

    ctx.fillStyle = "#6b6f9e";
    ctx.fillRect(-18, -42, 8, 18);

    const t = swordSwing > 0 ? Math.min(swordSwing, 1) : 0;
    const angle = -0.3 + t * 1.7;
    ctx.save();
    ctx.translate(12, -36);
    ctx.rotate(angle);
    ctx.fillStyle = "#8a93c7";
    ctx.fillRect(0, -3, 10, 6);
    ctx.fillStyle = "#e5e7f2";
    ctx.fillRect(9, -2, 34, 4);
    ctx.fillStyle = "#ffc857";
    ctx.fillRect(6, -4, 5, 8);
    ctx.restore();

    ctx.restore();
  }

  function drawZombie(z, x, y, alpha) {
    const limpOffset = z.limp ? Math.abs(Math.sin(z.bob)) * 3 : 0;
    const yy = y + Math.sin(z.bob) * 2 - limpOffset;
    const step = Math.sin(z.bob * 1.6);
    const skin = z.skin;
    const shirt = z.shirt;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, yy);
    ctx.rotate(z.tilt);

    ctx.fillStyle = "#2c2c22";
    ctx.fillRect(1, -18 + (step > 0 ? 2 : 0), 8, 18);
    ctx.fillStyle = "#33332a";
    ctx.fillRect(-9, -18 + (step < 0 ? 2 : 0), 8, 18);

    ctx.fillStyle = shirt;
    ctx.fillRect(-11, -42, 22, 26);
    ctx.fillStyle = skin;
    ctx.fillRect(-8, -34, 4, 6);
    ctx.fillRect(4, -28, 5, 5);
    ctx.fillStyle = "#7a1f2b";
    ctx.fillRect(-2, -30, 5, 7);
    ctx.fillStyle = "#a52e3c";
    ctx.fillRect(-1, -29, 3, 3);

    ctx.fillStyle = skin;
    ctx.fillRect(-7, -56, 14, 14);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-7, -47, 14, 5);
    ctx.fillStyle = "#22201a";
    ctx.fillRect(-8, -60, 5, 5);
    ctx.fillRect(0, -61, 4, 4);
    ctx.fillRect(5, -59, 4, 5);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-4, -51, 3, 3);
    ctx.fillRect(2, -51, 3, 3);

    if (!z.lostArm) {
      ctx.fillStyle = skin;
      ctx.fillRect(-17, -38 + step, 9, 6);
    } else {
      ctx.fillStyle = "#7a1f2b";
      ctx.fillRect(-14, -37, 4, 5);
    }
    ctx.fillStyle = skin;
    ctx.fillRect(9, -38 - step, 9, 6);

    ctx.restore();

    if (z.hp < HITS_TO_KILL_BASE) {
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let i = 0; i < HITS_TO_KILL_BASE; i++) {
        ctx.fillStyle = i < z.hp ? "#ff4d6d" : "rgba(245,243,237,0.2)";
        ctx.fillRect(px(x - 9 + i * 7), px(yy - 64), 5, 4);
      }
      ctx.restore();
    }
  }

  function drawHordeMass(hiddenCount) {
    if (hiddenCount <= 0) return;
    const baseX = castleX - 8;
    const spread = Math.min(90, 24 + hiddenCount * 0.02);
    ctx.save();
    ctx.fillStyle = "rgba(20, 30, 20, 0.55)";
    ctx.beginPath();
    ctx.ellipse(baseX, groundY - 4, 40 + spread, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = "12px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#f5f3ed";
    ctx.textAlign = "center";
    ctx.fillText(`+${formatCount(hiddenCount)} more`, baseX, groundY - 30);
    ctx.restore();
  }

  function updatePileHUD() {
    pileEl.textContent = formatCount(pile.length);
    const massive = pile.length >= 200;
    pileEl.classList.toggle("danger", massive);
    stage.classList.toggle("danger", massive);
  }

  function shakeStage() {
    stage.classList.remove("shake");
    // eslint-disable-next-line no-unused-expressions
    stage.offsetWidth;
    stage.classList.add("shake");
  }

  function tick(ts) {
    if (!running) return;
    const dt = lastTs ? ts - lastTs : 16;
    lastTs = ts;

    ctx.clearRect(0, 0, width, height);
    drawGround();

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnZombie();
      spawnTimer = spawnInterval();
    }

    for (let i = walkers.length - 1; i >= 0; i--) {
      const z = walkers[i];
      z.x -= z.speed * (dt / 16);
      z.bob += 0.12 * (dt / 16);
      if (z.x <= castleX - 4) {
        walkers.splice(i, 1);
        pile.push(z);
        updatePileHUD();
      }
    }

    for (const z of walkers) {
      drawZombie(z, z.x, groundY, 1);
    }

    drawCastle();

    const visibleCount = Math.min(pile.length, MAX_VISIBLE_PILE);
    drawHordeMass(pile.length - visibleCount);

    for (let i = visibleCount - 1; i >= 0; i--) {
      const z = pile[i];
      z.bob += 0.06 * (dt / 16);
      const isTarget = i === 0;
      const offset = i * 5;
      const alpha = isTarget ? 1 : 0.75 - i * 0.05;
      const flash = isTarget && hitFlash > 0;
      if (flash) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, hitFlash);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(castleX - 8 + offset, groundY - 30, 22, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawZombie(z, castleX - 8 + offset, groundY, Math.max(alpha, 0.4));
    }

    drawKnight();

    if (swordSwing > 0) {
      swordSwing += dt / 180;
      if (swordSwing > 1) swordSwing = 0;
    }
    if (hitFlash > 0) hitFlash -= dt / 150;

    requestAnimationFrame(tick);
  }

  function setCooldownVisual() {
    cooldownCircle.style.transition = "none";
    cooldownCircle.style.strokeDashoffset = String(RING_CIRC);
    // eslint-disable-next-line no-unused-expressions
    cooldownCircle.getBoundingClientRect();
    const ms = cooldownMs();
    cooldownCircle.style.transition = `stroke-dashoffset ${ms}ms linear`;
    cooldownCircle.style.strokeDashoffset = "0";
    swipeBtn.disabled = true;
    setTimeout(() => {
      swipeBtn.disabled = false;
    }, ms);
  }

  function killZombie() {
    pile.shift();
    score += 1;
    gold += 1;
    scoreEl.textContent = formatCount(score);
    updatePileHUD();
    save();
    refreshShopUI();
  }

  function attack() {
    if (!running) return;
    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + cooldownMs();
    setCooldownVisual();
    swordSwing = 0.001;

    if (pile.length === 0) return;
    shakeStage();

    const dmg = attackDamage();
    const targets = Math.min(cleaveTargets(), pile.length);
    hitFlash = 1;

    for (let i = 0; i < targets; i++) {
      const t = pile[i];
      if (t) t.hp -= dmg;
    }
    while (pile.length && pile[0].hp <= 0) {
      killZombie();
    }
  }

  swipeBtn.addEventListener("click", attack);
  canvas.addEventListener("pointerdown", attack);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      attack();
    }
  });

  function startGame() {
    score = 0;
    walkers = [];
    pile = [];
    spawnTimer = 300;
    lastTs = 0;
    cooldownUntil = 0;
    swordSwing = 0;
    hitFlash = 0;
    scoreEl.textContent = "0";
    stage.classList.remove("shake", "danger");
    updatePileHUD();
    refreshShopUI();
    startOverlay.classList.add("hidden");
    running = true;
    requestAnimationFrame(tick);
  }

  startBtn.addEventListener("click", startGame);

  loadSave();
  refreshShopUI();
})();
