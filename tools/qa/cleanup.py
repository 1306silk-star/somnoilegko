"""Убирает следы автотестов из рабочих данных сервера.

Затрагивает только записи, созданные проверками: копии, тестовые посты
и историю запусков AI. Пользовательские данные остаются на месте.
"""

from __future__ import annotations

import io
import json
import os
import re

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "server",
    "data",
)


def load(name: str):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return None
    with io.open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save(name: str, payload) -> None:
    path = os.path.join(DATA_DIR, name)
    with io.open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def clean() -> None:
    apps = load("apps.json")
    if apps and isinstance(apps.get("apps"), list):
        before = len(apps["apps"])
        # Из одинаковых записей оставляем ту, у которой стабильный встроенный id.
        groups: dict[tuple, list] = {}
        for app in apps["apps"]:
            # Пустая карточка появляется от нажатия «Добавить» во время проверок.
            if not (app.get("url") or "").strip():
                continue
            groups.setdefault((app.get("name"), app.get("url")), []).append(app)
        kept = []
        for variants in groups.values():
            chosen = next((item for item in variants if item.get("id") == "app-time"), variants[0])
            if chosen.get("url") == "https://time.somnoilegko.ru":
                chosen["id"] = "app-time"
                chosen["builtin"] = True
            kept.append(chosen)
        apps["apps"] = kept
        save("apps.json", apps)
        print(f"apps.json: {before} → {len(kept)}")

    telegram = load("telegram.json")
    if telegram and isinstance(telegram.get("posts"), list):
        before = len(telegram["posts"])
        telegram["posts"] = [
            post
            for post in telegram["posts"]
            if "автопроверк" not in (post.get("text") or "").lower()
        ]
        save("telegram.json", telegram)
        print(f"telegram.json: {before} → {len(telegram['posts'])}")

    brand = load("brandos.json")
    if brand and isinstance(brand.get("docs"), list):
        before = len(brand["docs"])
        brand["docs"] = [
            doc for doc in brand["docs"] if "(копия)" not in (doc.get("title") or "")
        ]
        save("brandos.json", brand)
        print(f"brandos.json: {before} → {len(brand['docs'])}")

    ai = load("ai.json")
    if ai:
        if isinstance(ai.get("tools"), list):
            before_tools = len(ai["tools"])
            seen_names = set()
            kept_tools = []
            for tool in sorted(
                ai["tools"], key=lambda item: 0 if str(item.get("id", "")).count("-") == 1 else 1
            ):
                name = (tool.get("name") or "").strip()
                if not name or "(копия)" in name or name in seen_names:
                    continue
                seen_names.add(name)
                kept_tools.append(tool)
            ai["tools"] = kept_tools
            print(f"ai.json tools: {before_tools} → {len(ai['tools'])}")
        ai["history"] = []
        save("ai.json", ai)
        print("ai.json: история запусков очищена")

    content = load("content.json")
    published = load("published.json")

    # Черновик после проверок мог набрать копий — приводим его к опубликованному.
    if content and published:
        for section, key in (
            ("faq", "question"),
            ("projects", "title"),
            ("cases", "title"),
            ("testimonials", "name"),
        ):
            items = (content.get(section) or {}).get("items")
            reference = (published.get(section) or {}).get("items")
            if isinstance(items, list) and isinstance(reference, list):
                allowed = [str(item.get(key) or "") for item in reference]
                deduped = []
                for item in items:
                    label = str(item.get(key) or "")
                    if label in allowed and label not in [
                        str(kept.get(key) or "") for kept in deduped
                    ]:
                        deduped.append(item)
                if len(deduped) != len(items):
                    content[section]["items"] = deduped
                    print(f"content.json {section}: {len(items)} → {len(deduped)}")
        save("content.json", content)

    for name, payload in (("content.json", content), ("published.json", published)):
        if not payload:
            continue
        changed = False
        faq = (payload.get("faq") or {}).get("items")
        if isinstance(faq, list):
            # Пустые записи появляются от нажатия «Добавить» во время проверок.
            kept = [
                item
                for item in faq
                if (item.get("question") or "").strip()
                and "Автотест" not in item["question"]
            ]
            if len(kept) != len(faq):
                payload["faq"]["items"] = kept
                changed = True
        for section in ("projects", "cases", "testimonials"):
            items = (payload.get(section) or {}).get("items")
            if isinstance(items, list):
                kept = [
                    item
                    for item in items
                    if (item.get("title") or item.get("name") or "").strip()
                    and not re.search(r"\(копия\)|Автотест", item.get("title") or "")
                ]
                if len(kept) != len(items):
                    payload[section]["items"] = kept
                    changed = True
        if changed:
            save(name, payload)
            print(f"{name}: тестовые записи удалены")


if __name__ == "__main__":
    clean()
    print("Готово")
