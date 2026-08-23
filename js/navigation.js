/**
 * Навигация: mobile menu, smooth scroll, состояние шапки
 */

(function initNavigation() {
  const header = document.querySelector(".site-header");
  const burger = document.querySelector(".burger");
  const mobileMenu = document.querySelector(".mobile-menu");
  const overlay = document.querySelector(".mobile-menu__overlay");
  const focusableSelector =
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  if (!header || !burger || !mobileMenu) return;

  let previousFocus = null;

  /* ── Состояние шапки при прокрутке ── */
  function updateHeaderScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  window.addEventListener("scroll", updateHeaderScroll, { passive: true });
  updateHeaderScroll();

  /* ── Mobile menu ── */
  function openMenu() {
    previousFocus = document.activeElement;
    burger.setAttribute("aria-expanded", "true");
    mobileMenu.classList.add("is-open");
    mobileMenu.setAttribute("aria-hidden", "false");
    overlay?.classList.add("is-visible");
    document.body.classList.add("no-scroll");

    const firstLink = mobileMenu.querySelector(focusableSelector);
    firstLink?.focus();
  }

  function closeMenu() {
    burger.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");
    overlay?.classList.remove("is-visible");
    document.body.classList.remove("no-scroll");

    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function toggleMenu() {
    const isOpen = burger.getAttribute("aria-expanded") === "true";
    isOpen ? closeMenu() : openMenu();
  }

  burger.addEventListener("click", toggleMenu);
  overlay?.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  /* Закрытие меню при клике на ссылку */
  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  /* Focus trap в mobile menu */
  mobileMenu.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !mobileMenu.classList.contains("is-open")) return;

    const focusable = [...mobileMenu.querySelectorAll(focusableSelector)];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ── Плавная прокрутка к якорям ── */
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-nav-link]");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#") || href === "#") return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();
    closeMenu();

    const headerHeight = header.offsetHeight;
    const top =
      target.getBoundingClientRect().top + window.scrollY - headerHeight - 8;

    window.scrollTo({ top, behavior: "smooth" });
    history.pushState(null, "", href);
  });

  /* ── Подсветка активного пункта при прокрутке ── */
  const scrollTargets = [...document.querySelectorAll("section[id]")];

  function setActiveNav(id) {
    document.querySelectorAll(".site-nav__link, .mobile-menu__link").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
    });
  }

  function updateActiveSection() {
    if (scrollTargets.length === 0) return;

    const offset = header.offsetHeight + 80;
    const scrollPos = window.scrollY + offset;
    let currentId = scrollTargets[0].id;

    scrollTargets.forEach((target) => {
      if (target.offsetTop <= scrollPos) {
        currentId = target.id;
      }
    });

    setActiveNav(currentId);
  }

  window.addEventListener("scroll", updateActiveSection, { passive: true });
  updateActiveSection();
})();
