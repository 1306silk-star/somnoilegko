/**
 * FAQ-аккордеон — доступность с клавиатуры
 */

(function initAccordion() {
  const items = document.querySelectorAll(".faq-item");
  if (items.length === 0) return;

  items.forEach((item) => {
    const trigger = item.querySelector(".faq-item__trigger");
    const panel = item.querySelector(".faq-item__panel");
    if (!trigger || !panel) return;

    const panelId = panel.id || `faq-panel-${Math.random().toString(36).slice(2, 9)}`;
    panel.id = panelId;
    trigger.setAttribute("aria-controls", panelId);

    trigger.addEventListener("click", () => toggleItem(item, items));
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleItem(item, items);
      }
    });
  });
})();

function toggleItem(item, allItems) {
  const trigger = item.querySelector(".faq-item__trigger");
  const isOpen = item.classList.contains("is-open");

  allItems.forEach((other) => {
    other.classList.remove("is-open");
    other.querySelector(".faq-item__trigger")?.setAttribute("aria-expanded", "false");
  });

  if (!isOpen) {
    item.classList.add("is-open");
    trigger?.setAttribute("aria-expanded", "true");
  }
}
