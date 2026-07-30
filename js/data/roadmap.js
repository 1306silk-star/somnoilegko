/**
 * Будущие проекты — блок «Скоро»
 */

const ROADMAP_DATA = [
  { title: "Библиотека проверенных промптов", status: "planned" },
  { title: "Игра для изучения иностранного языка", status: "dev" },
  { title: "Помощник по деловой переписке", status: "dev" },
  { title: "Планировщик поездок", status: "planned" },
  { title: "Новые боты", status: "planned" },
  { title: "Мини-сервисы для работы и жизни", status: "planned" },
];

const ROADMAP_STATUS_LABELS = {
  dev: "В разработке",
  planned: "Запланировано",
};

if (typeof window !== "undefined") {
  window.ROADMAP_DATA = ROADMAP_DATA;
  window.ROADMAP_STATUS_LABELS = ROADMAP_STATUS_LABELS;
}
