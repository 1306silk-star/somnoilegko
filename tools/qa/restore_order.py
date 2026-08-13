"""Возвращает порядок и статусы списков к исходным данным сайта.

Автопроверки нажимают кнопки сортировки и смены статуса, поэтому после
прогона списки нужно привести к тому виду, что задан в js/data/*.js.
"""

from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "server", "data")

sys.path.insert(0, os.path.join(ROOT, "server"))
from app import build_content_file, extract_content_object  # noqa: E402


def source_order(path: str, field: str) -> list[str]:
    with io.open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        raw = handle.read()
    return re.findall(rf'{field}:\s*"(.*?)"', raw)


def markup_order(pattern: str) -> list[str]:
    """Порядок из исходной разметки сайта — до подключения панели."""
    raw = subprocess.run(
        ["git", "show", "HEAD:index.html"], capture_output=True, cwd=ROOT
    ).stdout.decode("utf-8")
    return re.findall(pattern, raw)


def reorder(items: list, key: str, order: list[str]) -> list:
    ranked = sorted(
        items,
        key=lambda item: order.index(item.get(key))
        if item.get(key) in order
        else len(order),
    )
    for item in ranked:
        if item.get(key) in order:
            item["status"] = "published"
    return ranked


def apply_to(content: dict) -> dict:
    faq_order = source_order("js/data/faq.js", "question")
    project_order = source_order("js/data/projects.js", "title")

    content["faq"]["items"] = reorder(content["faq"]["items"], "question", faq_order)
    content["projects"]["items"] = reorder(
        content["projects"]["items"], "title", project_order
    )

    cases_order = markup_order(r"result-item__title[^>]*>\s*(.*?)\s*<")
    if content.get("cases", {}).get("items"):
        content["cases"]["items"] = reorder(
            content["cases"]["items"], "title", cases_order
        )
    return content


def main() -> None:
    for name in ("content.json", "published.json"):
        path = os.path.join(DATA_DIR, name)
        if not os.path.exists(path):
            continue
        with io.open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        with io.open(path, "w", encoding="utf-8") as handle:
            json.dump(apply_to(payload), handle, ensure_ascii=False, indent=2)
        print(f"{name}: порядок восстановлен")

    site_path = os.path.join(ROOT, "data", "content.js")
    with io.open(site_path, encoding="utf-8") as handle:
        site = extract_content_object(handle.read())
    with io.open(site_path, "w", encoding="utf-8") as handle:
        handle.write(build_content_file(apply_to(site)))
    print("data/content.js: порядок восстановлен")


if __name__ == "__main__":
    main()
