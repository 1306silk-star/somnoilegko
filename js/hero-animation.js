/**
 * Hero — последовательное появление строк заголовка (один раз)
 */

(function initHeroAnimation() {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const eyebrow = hero.querySelector(".hero__eyebrow");
  const lines = hero.querySelectorAll(".hero__title-line");
  const dash = hero.querySelector(".hero__title-dash");
  const promise = hero.querySelector(".hero__promise");
  const lead = hero.querySelector(".hero__lead");
  const actions = hero.querySelector(".hero__actions");
  const editorial = hero.querySelector(".hero__editorial");
  const motif = hero.querySelector(".motif-stroke");

  const LINE_DELAY = 220;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal(el) {
    if (el) el.classList.add("is-visible");
  }

  function revealLine(line) {
    if (!line) return;
    line.querySelectorAll(".hero__word").forEach((word) => reveal(word));
  }

  function revealAll() {
    reveal(eyebrow);
    lines.forEach(revealLine);
    reveal(dash);
    reveal(promise);
    reveal(lead);
    reveal(actions);
    reveal(editorial);
    if (motif) motif.classList.add("is-drawn");
    hero.classList.add("hero--done");
  }

  if (reducedMotion) {
    revealAll();
    return;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function runSequence() {
    hero.classList.add("hero--animating");
    reveal(eyebrow);
    await wait(120);

    for (const line of lines) {
      revealLine(line);
      await wait(LINE_DELAY);
    }

    reveal(dash);
    await wait(160);
    reveal(promise);
    await wait(LINE_DELAY);
    reveal(lead);
    await wait(LINE_DELAY);
    reveal(actions);
    reveal(editorial);
    if (motif) motif.classList.add("is-drawn");

    hero.classList.add("hero--done");
    hero.classList.remove("hero--animating");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSequence);
  } else {
    runSequence();
  }
})();
