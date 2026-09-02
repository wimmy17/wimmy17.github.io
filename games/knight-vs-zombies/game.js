(function () {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const scoreEl = document.getElementById("score");
  const pileEl = document.getElementById("pile");
  const bestEl = document.getElementById("best");
  const startOverlay = document.getElementById("start-overlay");
  const endOverlay = document.getElementById("end-overlay");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");
  const endSummary = document.getElementById("end-summary");
  const endHeading = document.getElementById("end-heading");
  const swipeBtn = document.getElementById("swipe-btn");
  const cooldownCircle = document.querySelector(".cooldown-ring circle");
  const RING_CIRC = 2 * Math.PI * 19;

  const STORAGE_KEY = "popcade-knight-vs-zombies-best";
  const MAX_PILE = 6;
  const HITS_TO_KILL = 3;
  const COOLDOWN_MS = 500;

  let width, height, groundY, wallX, knightX;
  let walkers = [];   // zombies still approaching the wall
  let pile = [];       // zombies queued at the wall, pile[0] is the target
  let score = 0;
  let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  bestEl.textContent = best;
  let running = false;
  let spawnTimer = 0;
  let lastTs = 0;
  let cooldownUntil = 0;
  let swordSwing = 0; // 0..1 progress of the current swing animation, 0 = idle
  let hitFlash = 0;   // brief flash on the target when hit

  function resize() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    groundY = height * 0.78;
    wallX = width * 0.76;
    knightX = width * 0.6;
  }
  window.addEventListener("resize", resize);
  resize();

  function spawnInterval() {
    // gets faster as score climbs, floor around 900ms
    return Math.max(900, 2200 - score * 60);
  }

  const SKIN_TONES = ["#7a9b6e", "#8c9e6a", "#6f8f7a", "#93926a"];
  const SHIRT_TONES = ["#4a3f2c", "#3e4a3f", "#463a4a", "#4a4635"];

  function spawnZombie() {
    walkers.push({
      x: width + 20,
      hp: HITS_TO_KILL,
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

  function drawWall() {
    const wTop = groundY - 74;
    ctx.fillStyle = "#3a3d63";
    ctx.fillRect(px(wallX), px(wTop), px(width - wallX), px(groundY - wTop));
    ctx.fillStyle = "#4c507f";
    for (let y = wTop; y < groundY; y += 12) {
      for (let x = wallX + ((y / 12) % 2 === 0 ? 0 : 8); x < width; x += 16) {
        ctx.fillRect(px(x), px(y), 12, 8);
      }
    }
  }

  function drawGround() {
    ctx.fillStyle = "#0f1026";
    ctx.fillRect(0, px(groundY), width, height - groundY);
    ctx.fillStyle = "rgba(245,243,237,0.06)";
    for (let x = 0; x < width; x += 24) {
      ctx.fillRect(px(x), px(groundY), 12, 3);
    }
  }

  function drawKnight() {
    const x = knightX;
    const y = groundY;
    const swinging = swordSwing > 0;
    ctx.save();
    ctx.translate(x, y);

    // legs
    ctx.fillStyle = "#2b2f52";
    ctx.fillRect(-10, -20, 8, 20);
    ctx.fillRect(2, -20, 8, 20);

    // body
    ctx.fillStyle = "#8a93c7";
    ctx.fillRect(-12, -46, 24, 28);

    // head
    ctx.fillStyle = "#e8c9a0";
    ctx.fillRect(-7, -60, 14, 14);
    ctx.fillStyle = "#c9cbe0";
    ctx.fillRect(-9, -62, 18, 8);

    // shield arm
    ctx.fillStyle = "#6b6f9e";
    ctx.fillRect(-18, -42, 8, 18);

    // sword arm + blade, swings from up-back to forward-down across the wall
    const t = swinging ? Math.min(swordSwing, 1) : 0;
    const angle = -0.9 + t * 1.9; // radians, sweeps forward
    ctx.save();
    ctx.translate(12, -38);
    ctx.rotate(angle);
    ctx.fillStyle = "#8a93c7";
    ctx.fillRect(0, -3, 10, 6); // arm
    ctx.fillStyle = "#e5e7f2";
    ctx.fillRect(9, -2, 30, 4); // blade
    ctx.fillStyle = "#ffc857";
    ctx.fillRect(6, -4, 5, 8); // hilt
    ctx.restore();

    ctx.restore();
  }

  function drawZombie(z, x, alpha, offsetY) {
    const limpOffset = z.limp ? Math.abs(Math.sin(z.bob)) * 3 : 0;
    const y = groundY + Math.sin(z.bob) * 2 - limpOffset + (offsetY || 0);
    const step = Math.sin(z.bob * 1.6);
    const skin = z.skin;
    const shirt = z.shirt;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(z.tilt);

    // back leg (dragging)
    ctx.fillStyle = "#2c2c22";
    ctx.fillRect(1, -18 + (step > 0 ? 2 : 0), 8, 18);
    // front leg
    ctx.fillStyle = "#33332a";
    ctx.fillRect(-9, -18 + (step < 0 ? 2 : 0), 8, 18);

    // torn shirt / torso
    ctx.fillStyle = shirt;
    ctx.fillRect(-11, -42, 22, 26);
    // shirt rips exposing skin
    ctx.fillStyle = skin;
    ctx.fillRect(-8, -34, 4, 6);
    ctx.fillRect(4, -28, 5, 5);
    // wound / blood patch
    ctx.fillStyle = "#7a1f2b";
    ctx.fillRect(-2, -30, 5, 7);
    ctx.fillStyle = "#a52e3c";
    ctx.fillRect(-1, -29, 3, 3);

    // neck + head, tilted like it's dead-eyed
    ctx.fillStyle = skin;
    ctx.fillRect(-7, -56, 14, 14);
    // jaw shadow / hollow cheek
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-7, -47, 14, 5);
    // ragged hair tufts
    ctx.fillStyle = "#22201a";
    ctx.fillRect(-8, -60, 5, 5);
    ctx.fillRect(0, -61, 4, 4);
    ctx.fillRect(5, -59, 4, 5);
    // glowing eyes
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-4, -51, 3, 3);
    ctx.fillRect(2, -51, 3, 3);

    // arms reaching forward, dragging with the shamble
    if (!z.lostArm) {
      ctx.fillStyle = skin;
      ctx.fillRect(-17, -38 + step, 9, 6);
    } else {
      // stump
      ctx.fillStyle = "#7a1f2b";
      ctx.fillRect(-14, -37, 4, 5);
    }
    ctx.fillStyle = skin;
    ctx.fillRect(9, -38 - step, 9, 6);

    ctx.restore();

    // hp pips above the head
    if (z.hp < HITS_TO_KILL) {
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let i = 0; i < HITS_TO_KILL; i++) {
        ctx.fillStyle = i < z.hp ? "#ff4d6d" : "rgba(245,243,237,0.2)";
        ctx.fillRect(px(x - 9 + i * 7), px(y - 64), 5, 4);
      }
      ctx.restore();
    }
  }

  function updatePileHUD() {
    pileEl.textContent = `${pile.length}/${MAX_PILE}`;
    const nearOverrun = pile.length >= MAX_PILE - 1;
    pileEl.classList.toggle("danger", nearOverrun);
    stage.classList.toggle("danger", nearOverrun);
  }

  function shakeStage() {
    stage.classList.remove("shake");
    // force reflow so the animation can retrigger on back-to-back hits
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

    // move walkers toward the wall, then hand them into the pile
    for (let i = walkers.length - 1; i >= 0; i--) {
      const z = walkers[i];
      z.x -= z.speed * (dt / 16);
      z.bob += 0.12 * (dt / 16);
      if (z.x <= wallX + 24) {
        walkers.splice(i, 1);
        pile.push(z);
        if (pile.length > MAX_PILE) {
          endGame();
          return;
        }
        updatePileHUD();
      }
    }

    for (const z of walkers) {
      drawZombie(z, z.x, 1, 0);
    }

    drawWall();

    // pile renders behind-to-front so the front target reads on top,
    // each one nudged slightly to look piled into each other rather than lined up
    for (let i = pile.length - 1; i >= 0; i--) {
      const z = pile[i];
      z.bob += 0.06 * (dt / 16);
      const isTarget = i === 0;
      const offset = i * 5;
      const alpha = isTarget ? 1 : 0.75 - i * 0.06;
      const flash = isTarget && hitFlash > 0;
      if (flash) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, hitFlash);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(wallX + offset, groundY - 30, 22, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawZombie(z, wallX + offset, Math.max(alpha, 0.4), 0);
    }

    drawKnight();

    if (swordSwing > 0) {
      swordSwing += dt / 180;
      if (swordSwing > 1) swordSwing = 0;
    }
    if (hitFlash > 0) hitFlash -= dt / 150;

    requestAnimationFrame(tick);
  }

  function setCooldownVisual(active) {
    if (active) {
      cooldownCircle.style.transition = "none";
      cooldownCircle.style.strokeDashoffset = String(RING_CIRC);
      // force reflow so the next transition actually animates
      // eslint-disable-next-line no-unused-expressions
      cooldownCircle.getBoundingClientRect();
      cooldownCircle.style.transition = `stroke-dashoffset ${COOLDOWN_MS}ms linear`;
      cooldownCircle.style.strokeDashoffset = "0";
      swipeBtn.disabled = true;
      setTimeout(() => {
        swipeBtn.disabled = false;
      }, COOLDOWN_MS);
    }
  }

  function attack() {
    if (!running) return;
    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + COOLDOWN_MS;
    setCooldownVisual(true);

    swordSwing = 0.001;

    if (pile.length === 0) return;
    const target = pile[0];
    target.hp -= 1;
    hitFlash = 1;
    shakeStage();
    if (target.hp <= 0) {
      pile.shift();
      score += 1;
      scoreEl.textContent = score;
      updatePileHUD();
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
    spawnTimer = 400;
    lastTs = 0;
    cooldownUntil = 0;
    swordSwing = 0;
    hitFlash = 0;
    scoreEl.textContent = "0";
    stage.classList.remove("shake", "danger");
    updatePileHUD();
    startOverlay.classList.add("hidden");
    endOverlay.classList.add("hidden");
    running = true;
    requestAnimationFrame(tick);
  }

  function endGame() {
    running = false;
    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      bestEl.textContent = best;
    }
    endHeading.textContent = isNewBest ? "New best — but overrun!" : "Overrun!";
    endSummary.textContent = `You held the wall against ${score} zombie${score === 1 ? "" : "s"}.`;
    endOverlay.classList.remove("hidden");
  }

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
})();
