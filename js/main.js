// Floating decorative balloons in the hero canvas. Purely for atmosphere —
// click one for a little pop, just like the real game.
(function () {
  const canvas = document.getElementById("balloon-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const colors = ["#ff4d6d", "#ffc857", "#4ecdc4", "#f5f3ed"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let balloons = [];
  let width, height;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function makeBalloon() {
    return {
      x: Math.random() * width,
      y: height + Math.random() * 200,
      r: 18 + Math.random() * 16,
      speed: 0.25 + Math.random() * 0.35,
      sway: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      popped: false,
      popT: 0,
    };
  }

  function init() {
    resize();
    const count = window.innerWidth < 640 ? 6 : 10;
    balloons = Array.from({ length: count }, makeBalloon);
  }

  function drawBalloon(b) {
    if (b.popped) {
      // simple burst: a few expanding lines
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - b.popT / 18);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        const len = b.popT * 2.2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + Math.cos(angle) * len, b.y + Math.sin(angle) * len);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r * 0.82, b.r, 0, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    // highlight
    ctx.beginPath();
    ctx.ellipse(-b.r * 0.28, -b.r * 0.35, b.r * 0.18, b.r * 0.28, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    // knot + string
    ctx.beginPath();
    ctx.moveTo(0, b.r);
    ctx.lineTo(0, b.r + 22);
    ctx.strokeStyle = "rgba(245,243,237,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function step() {
    ctx.clearRect(0, 0, width, height);
    for (const b of balloons) {
      if (b.popped) {
        b.popT += 1;
        if (b.popT > 18) Object.assign(b, makeBalloon(), { y: height + 40 });
      } else {
        b.y -= b.speed;
        b.sway += 0.02;
        b.x += Math.sin(b.sway) * 0.4;
        if (b.y < -40) Object.assign(b, makeBalloon(), { y: height + 40 });
      }
      drawBalloon(b);
    }
    if (!reduceMotion) requestAnimationFrame(step);
  }

  function hitTest(x, y) {
    for (const b of balloons) {
      if (b.popped) continue;
      const dx = x - b.x;
      const dy = y - b.y;
      if ((dx * dx) / (b.r * 0.82 * b.r * 0.82) + (dy * dy) / (b.r * b.r) <= 1) {
        b.popped = true;
        b.popT = 0;
        if (reduceMotion) {
          Object.assign(b, makeBalloon(), { y: height + 40 });
        }
        return;
      }
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    hitTest(e.clientX - rect.left, e.clientY - rect.top);
  });

  window.addEventListener("resize", resize);
  init();
  if (reduceMotion) {
    step(); // draw one static frame
  } else {
    requestAnimationFrame(step);
  }
})();
