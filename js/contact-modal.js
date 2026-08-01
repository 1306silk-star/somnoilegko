/**
 * Модальное окно «Написать мне» — открытие, валидация, отправка в Telegram
 */

(function initContactModal() {
  const modal = document.getElementById("contact-modal");
  const form = document.getElementById("contact-form");
  const openTriggers = document.querySelectorAll("[data-contact-modal-open]");
  const closeTriggers = document.querySelectorAll("[data-contact-modal-close]");

  if (!modal || !form || openTriggers.length === 0) return;

  const focusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let previousFocus = null;

  function getFieldError(field) {
    const wrapper = field.closest(".contact-form__field");
    return wrapper?.querySelector(".contact-form__error");
  }

  function setFieldInvalid(field, message) {
    field.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");
    const errorEl = getFieldError(field);
    if (errorEl) errorEl.textContent = message;
  }

  function clearFieldInvalid(field) {
    field.classList.remove("is-invalid");
    field.removeAttribute("aria-invalid");
    const errorEl = getFieldError(field);
    if (errorEl) errorEl.textContent = "";
  }

  function validateForm() {
    let isValid = true;
    const name = form.elements.namedItem("name");
    const phone = form.elements.namedItem("phone");
    const email = form.elements.namedItem("email");
    const consent = form.elements.namedItem("consent");

    [name, phone, email, consent].forEach((field) => {
      if (field) clearFieldInvalid(field);
    });

    if (!name.value.trim()) {
      setFieldInvalid(name, "Укажите, как к вам обращаться");
      isValid = false;
    }

    const phoneDigits = phone.value.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setFieldInvalid(phone, "Укажите корректный номер телефона");
      isValid = false;
    }

    if (!email.value.trim() || !email.checkValidity()) {
      setFieldInvalid(email, "Укажите корректный email");
      isValid = false;
    }

    if (!consent.checked) {
      setFieldInvalid(consent, "Необходимо согласие на обработку данных");
      isValid = false;
    }

    return isValid;
  }

  function buildTelegramUrl() {
    const name = form.elements.namedItem("name").value.trim();
    const phone = form.elements.namedItem("phone").value.trim();
    const email = form.elements.namedItem("email").value.trim();
    const telegram = window.SITE_CONFIG?.telegram || "https://t.me/somnoi_legko";

    const message = [
      "Здравствуйте! Хочу связаться через форму на сайте.",
      "",
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Email: ${email}`,
    ].join("\n");

    const baseUrl = telegram.split("?")[0];
    return `${baseUrl}?text=${encodeURIComponent(message)}`;
  }

  function openModal() {
    previousFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");

    const firstInput = form.querySelector("input:not([type='checkbox'])");
    window.setTimeout(() => firstInput?.focus(), 50);
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");

    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
  }

  function resetForm() {
    form.reset();
    form.querySelectorAll(".contact-form__input, .contact-form__checkbox").forEach(clearFieldInvalid);
  }

  openTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openModal();
    });
  });

  closeTriggers.forEach((trigger) => {
    trigger.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !modal.classList.contains("is-open")) return;

    const dialog = modal.querySelector(".contact-modal__dialog");
    const focusable = [...dialog.querySelectorAll(focusableSelector)];
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

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      clearFieldInvalid(target);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validateForm()) {
      const firstInvalid = form.querySelector(".is-invalid");
      firstInvalid?.focus();
      return;
    }

    window.open(buildTelegramUrl(), "_blank", "noopener,noreferrer");
    resetForm();
    closeModal();
  });
})();
