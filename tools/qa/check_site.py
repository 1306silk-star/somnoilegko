"""Разовая проверка публичного сайта: адаптив, консоль, CTA, переполнение."""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://127.0.0.1:8085/"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(SHOTS, exist_ok=True)
problems: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    mark = "OK" if cond else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        problems.append(f"{label}: {detail}")


SCRIPT = """
(() => {
  const h1 = document.querySelector("h1");
  const lexBtn = [...document.querySelectorAll("a")].find(
    (a) => a.textContent.trim().includes("Попробовать Лекса")
  );
  const email = document.querySelector('a[href^="mailto:"]');
  const overflow =
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  const lex = document.getElementById("lex");
  const skills = [...document.querySelectorAll(".skills__item")].map((n) =>
    n.textContent.trim()
  );
  return {
    title: document.title,
    h1: h1 ? h1.innerText.replace(/\\s+/g, " ").trim() : "",
    lexBtnHref: lexBtn ? lexBtn.getAttribute("href") : null,
    lexBtnTarget: lexBtn ? lexBtn.getAttribute("target") : null,
    overflow,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    emailHref: email ? email.getAttribute("href") : null,
    lexVisible: !!(lex && lex.offsetHeight > 0),
    skills,
    h1Count: document.querySelectorAll("h1").length,
    ctaInView: (() => {
      const actions = document.querySelector(".hero__actions");
      if (!actions) return false;
      const r = actions.getBoundingClientRect();
      return r.top < window.innerHeight - 8 && r.bottom > 0;
    })(),
  };
})()
"""


def main() -> int:
    browser = Browser(CHROME, port=9333, headless=True)
    browser.call("Network.enable")
    browser.call("Network.setCacheDisabled", {"cacheDisabled": True})
    try:
        for name, width, height, mobile in (
            ("desktop", 1440, 900, False),
            ("laptop", 1024, 768, False),
            ("tablet", 768, 1024, True),
            ("mobile", 390, 844, True),
        ):
            browser.viewport(width, height, mobile=mobile)
            browser.clear_console()
            browser.navigate(BASE, settle=2.2)
            data = browser.js(SCRIPT)
            print(name, json.dumps(data, ensure_ascii=False)[:900])
            check(f"{name} H1", data["h1Count"] == 1 and "время" in data["h1"], data["h1"][:90])
            check(
                f"{name} Lex CTA",
                data["lexBtnHref"] == "https://t.me/irinaai13_bot"
                and data["lexBtnTarget"] == "_blank",
            )
            check(
                f"{name} no overflow",
                not data["overflow"],
                f"{data['scrollWidth']} vs {data['clientWidth']}",
            )
            check(f"{name} lex visible", data["lexVisible"])
            check(
                f"{name} skills",
                "OpenClaw" in data["skills"] and "Cursor" in data["skills"],
            )
            check(
                f"{name} email mailto",
                data.get("emailHref") == "mailto:1306silk@gmail.com",
                str(data.get("emailHref")),
            )
            check(f"{name} hero CTA in view", data.get("ctaInView") is True)
            real = [
                err
                for err in browser.errors()
                if "favicon" not in err.get("text", "").lower()
            ]
            check(f"{name} console", not real, json.dumps(real, ensure_ascii=False)[:400])
            browser.screenshot(os.path.join(SHOTS, f"site-{name}.png"))

        browser.viewport(1440, 900, mobile=False)
        browser.navigate(BASE, settle=1.5)
        browser.js('document.querySelector(\'a[href="#lex"]\').click()')
        time.sleep(0.9)
        at_lex = browser.js(
            "Math.abs(document.getElementById('lex').getBoundingClientRect().top) < 160"
        )
        check("nav to lex", bool(at_lex))
    finally:
        browser.close()

    print("PROBLEMS", len(problems))
    for item in problems:
        print(" -", item)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
