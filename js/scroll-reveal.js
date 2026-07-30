/**
 * Scroll Reveal — clip-path и stagger для крупных секций
 */

(function initScrollReveal() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const elements = document.querySelectorAll(".reveal, .reveal-clip, .reveal-image, .reveal-stagger");

  if (reducedMotion) {
    elements.forEach((el) => el.classList.add("is-visible"));
    document.querySelectorAll(".reveal-stagger > *").forEach((c) => c.classList.add("is-visible"));
    return;
  }

  if (!("IntersectionObserver" in window)) {
    elements.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;

        if (el.classList.contains("reveal-stagger")) {
          el.classList.add("is-visible");
          el.querySelectorAll(":scope > *").forEach((child, i) => {
            child.style.transitionDelay = `${i * 0.08}s`;
            child.classList.add("is-visible");
          });
        } else {
          el.classList.add("is-visible");
        }
        observer.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );

  elements.forEach((el) => observer.observe(el));
})();
