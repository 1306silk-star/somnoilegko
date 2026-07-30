/**
 * Визуальные эффекты: gradient mesh, spotlight, magnetic hover
 * Адаптация паттернов React Bits / 21st.dev для vanilla JS
 */

(function initEffects() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  initSpotlightCards();
  initMagneticButtons();
  if (!reducedMotion) initGradientMesh();
})();

function initSpotlightCards() {
  document.querySelectorAll("[data-spotlight]").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty("--spot-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);

      if (card.hasAttribute("data-tilt")) {
        const rx = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
        const ry = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-5px)`;
      }
    });
    card.addEventListener("mouseleave", () => {
      card.style.setProperty("--spot-x", "50%");
      card.style.setProperty("--spot-y", "50%");
      if (card.hasAttribute("data-tilt")) {
        card.style.transform = "";
      }
    });
  });
}

function initMagneticButtons() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;

  document.querySelectorAll("[data-magnetic]").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.12}px, ${y * 0.18}px)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "";
    });
  });
}

function initGradientMesh() {
  const canvas = document.getElementById("hero-mesh");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let frame = 0;
  let rafId = 0;

  const blobs = [
    { x: 0.72, y: 0.28, r: 0.38, color: [30, 77, 58], speed: 0.00018 },
    { x: 0.18, y: 0.72, r: 0.32, color: [212, 114, 106], speed: 0.00014 },
    { x: 0.55, y: 0.65, r: 0.28, color: [232, 237, 228], speed: 0.00011 },
  ];

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    width = parent.offsetWidth;
    height = parent.offsetHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function draw() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);
    blobs.forEach((blob, i) => {
      const t = frame * blob.speed + i * 1.7;
      const cx = (blob.x + Math.sin(t) * 0.06) * width;
      const cy = (blob.y + Math.cos(t * 0.85) * 0.05) * height;
      const radius = blob.r * Math.min(width, height);
      const [r, g, b] = blob.color;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.22)`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},0.08)`);
      grad.addColorStop(1, "rgba(247,244,239,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    });
    rafId = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(rafId);
    else draw();
  });
}
