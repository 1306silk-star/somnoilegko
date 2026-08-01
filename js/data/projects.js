/**
 * Проекты экосистемы «Сомной_легко»
 */

const PROJECTS_DATA = [
  {
    id: "content-helper",
    category: "Для работы",
    title: "Помощник для создания контента",
    task: "Регулярно нужны идеи для публикаций, но на их поиск уходит много времени",
    solution: "Помощник генерирует идеи для постов, сторис и недельного контент-плана",
    benefits: [
      "Готовые идеи за пару минут",
      "Структура для недели контента",
      "Не нужно начинать с пустого листа",
    ],
    features: ["бесплатно", "без регистрации", "работает в браузере"],
    url: "https://1306silk-star.github.io/my_test/",
    github: "https://github.com/1306silk-star/my_test",
    published: true,
    embedUrl: "https://1306silk-star.github.io/my_test/",
  },
  {
    id: "budget",
    category: "Для жизни",
    title: "Личный бюджет",
    task: "Сложно отслеживать расходы и понимать, сколько откладывать на цель",
    solution: "Простой инструмент для учёта финансов и движения к цели накоплений в евро",
    benefits: [
      "Понятная структура расходов",
      "Расчёты в евро",
      "Визуализация прогресса к цели",
    ],
    features: ["понятная структура", "расчёты в евро", "визуализация цели"],
    url: "https://1306silk-star.github.io/my_budget/",
    github: "https://github.com/1306silk-star/my_budget",
    published: true,
    embedUrl: "https://1306silk-star.github.io/my_budget/",
  },
];

if (typeof window !== "undefined") {
  window.PROJECTS_DATA = PROJECTS_DATA;
}
