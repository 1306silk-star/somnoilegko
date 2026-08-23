/**
 * Конфигурация сайта
 */

const SITE_CONFIG = {
  lang: "ru",
  brand: "Сомной_легко",
  person: "Ирина Андреева",
  telegram: "https://t.me/somnoi_legko",
  github: "https://github.com/1306silk-star",
  lex: "https://t.me/irinaai13_bot",
  siteUrl: "https://somnoilegko.ru/",
  email: "1306silk@gmail.com",
  apps: {
    contentHelper: "https://1306silk-star.github.io/my_test/",
    budget: "https://1306silk-star.github.io/my_budget/",
  },
  images: {
    hero: "assets/images/about/about.jpg",
    about: "assets/images/contacts/contacts.jpg",
    cta: "assets/images/hero/hero.png",
    og: "assets/images/about/about.jpg",
  },
};

if (typeof window !== "undefined") {
  window.SITE_CONFIG = SITE_CONFIG;
}
