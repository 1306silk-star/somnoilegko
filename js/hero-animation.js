/**
 * Hero — последовательное появление слов заголовка (один раз)
 */

(function initHeroAnimation() {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const eyebrow = hero.querySelector(".hero__eyebrow");
  const words = hero.querySelectorAll(".hero__word");
  const dash = hero.querySelector(".hero__title-dash");
  const tagline = hero.querySelector(".hero__tagline");
  const actions = hero.querySelector(".hero__actions");
  const editorial = hero.querySelector(".hero__editorial");
  const motif = hero.querySelector(".motif-stroke");

  const WORD_DELAY = 200;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal(el) {
    if (el) el.classList.add("is-visible");
  }

  function revealAll() {
    reveal(eyebrow);
    words.forEach((word) => reveal(word));
    reveal(dash);
    reveal(tagline);
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
    await wait(100);

    for (const word of words) {
      reveal(word);
      await wait(WORD_DELAY);
    }

    reveal(dash);
    await wait(180);
    reveal(tagline);
    await wait(WORD_DELAY);
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
