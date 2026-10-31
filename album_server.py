# -*- coding: utf-8 -*-
"""Лёгкий локальный сервер слайдшоу + загрузка фото (только 127.0.0.1)."""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import threading
import traceback
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Ошибка: нужна библиотека Pillow. Запустите через .venv проекта.")
    sys.exit(1)

HOST = "127.0.0.1"
PORT = 8765
MAX_FILES = 20
MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
TARGET_W, TARGET_H = 1920, 1080
WEBP_QUALITY = 85
BG = (17, 17, 17)

ROOT = Path(__file__).resolve().parent
if os.environ.get("ALBUM_ROOT"):
    ROOT = Path(os.environ["ALBUM_ROOT"]).resolve()

SLIDES_DIR = ROOT / "album_slides"
MANIFEST_PATH = SLIDES_DIR / "manifest.json"
UPLOAD_LOCK = threading.Lock()


def fit_to_canvas(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    iw, ih = img.size
    scale = min(TARGET_W / iw, TARGET_H / ih)
    nw = max(1, int(round(iw * scale)))
    nh = max(1, int(round(ih * scale)))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (TARGET_W, TARGET_H), BG)
    canvas.paste(resized, ((TARGET_W - nw) // 2, (TARGET_H - nh) // 2))
    return canvas


def unique_name(index: int, stamp: str, used: set[str]) -> str:
    n = index
    while True:
        name = f"added_{stamp}_{n:03d}.webp"
        if name not in used and not (SLIDES_DIR / name).exists():
            used.add(name)
            return name
        n += 1


def parse_multipart(body: bytes, content_type: str):
    """Простой разбор multipart/form-data без модуля cgi (удалён в Python 3.13+)."""
    m = re.search(r'boundary=(?:"([^"]+)"|([^;\s]+))', content_type, re.I)
    if not m:
        raise RuntimeError("Не найден boundary в Content-Type")
    boundary = (m.group(1) or m.group(2)).encode("ascii", errors="ignore")
    if not boundary:
        raise RuntimeError("Пустой boundary")

    fields: dict[str, list[str]] = {}
    files: list[tuple[str, bytes]] = []

    for raw_part in body.split(b"--" + boundary):
        if not raw_part or raw_part in (b"--", b"--\r\n", b"\r\n"):
            continue
        if raw_part.startswith(b"--"):
            continue
        if raw_part.startswith(b"\r\n"):
            raw_part = raw_part[2:]
        if raw_part.endswith(b"\r\n"):
            raw_part = raw_part[:-2]

        sep = raw_part.find(b"\r\n\r\n")
        if sep < 0:
            continue
        header_blob = raw_part[:sep].decode("utf-8", errors="replace")
        data = raw_part[sep + 4 :]
        if data.endswith(b"\r\n"):
            data = data[:-2]

        disp = ""
        for line in header_blob.split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                disp = line
                break
        name_m = re.search(r'name="([^"]+)"', disp)
        if not name_m:
            continue
        name = name_m.group(1)
        filename_m = re.search(r'filename="([^"]*)"', disp)
        if filename_m is not None:
            files.append((filename_m.group(1) or "photo.jpg", data))
        else:
            fields.setdefault(name, []).append(data.decode("utf-8", errors="replace"))

    return fields, files


def process_upload(file_items, insert_before_last: bool) -> dict:
    if not MANIFEST_PATH.exists():
        raise RuntimeError("Не найден manifest.json")

    with open(MANIFEST_PATH, encoding="utf-8-sig") as f:
        manifest = json.load(f)

    slides = list(manifest.get("slides") or [])
    if not slides:
        raise RuntimeError("В manifest.json пустой список слайдов")

    if len(file_items) == 0:
        raise RuntimeError("Файлы не переданы")
    if len(file_items) > MAX_FILES:
        raise RuntimeError(f"Не больше {MAX_FILES} фотографий за одну загрузку")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    used_names = set(slides)
    created: list[Path] = []
    new_names: list[str] = []

    try:
        for i, (filename, raw) in enumerate(file_items, start=1):
            if raw is None:
                raise RuntimeError(f"Пустой файл: {filename}")
            if len(raw) > MAX_FILE_BYTES:
                raise RuntimeError(
                    f"Файл «{filename}» больше 20 МБ ({len(raw) / 1024 / 1024:.1f} МБ)"
                )
            if len(raw) == 0:
                raise RuntimeError(f"Пустой файл: {filename}")
            ext = Path(filename or "").suffix.lower()
            if ext not in ALLOWED_EXT:
                raise RuntimeError(f"Неподдерживаемый формат: {filename}")

            name = unique_name(i, stamp, used_names)
            out_path = SLIDES_DIR / name

            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(raw)
                tmp_path = Path(tmp.name)

            try:
                with Image.open(tmp_path) as im:
                    canvas = fit_to_canvas(im)
                    canvas.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
                    del canvas
            finally:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass

            created.append(out_path)
            new_names.append(name)

        if insert_before_last and len(slides) >= 1:
            updated = slides[:-1] + new_names + [slides[-1]]
        else:
            updated = slides + new_names

        new_manifest = dict(manifest)
        new_manifest["slides"] = updated
        new_manifest["count"] = len(updated)

        tmp_man = MANIFEST_PATH.with_suffix(".json.tmp")
        with open(tmp_man, "w", encoding="utf-8") as f:
            json.dump(new_manifest, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_man, MANIFEST_PATH)

        return {
            "ok": True,
            "added": new_names,
            "count": len(updated),
            "slides": updated,
            "insert_before_last": insert_before_last,
        }
    except Exception:
        for p in created:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
        raise


class AlbumHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/upload":
            self.send_error(404)
            return

        if not UPLOAD_LOCK.acquire(blocking=False):
            self._send_json(
                429, {"ok": False, "error": "Уже идёт другая загрузка. Подождите."}
            )
            return

        try:
            ctype = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in ctype:
                self._send_json(400, {"ok": False, "error": "Ожидается multipart/form-data"})
                return

            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0:
                self._send_json(400, {"ok": False, "error": "Пустой запрос"})
                return
            if length > MAX_FILES * MAX_FILE_BYTES + 5 * 1024 * 1024:
                self._send_json(400, {"ok": False, "error": "Слишком большой запрос"})
                return

            body = self.rfile.read(length)
            fields, files = parse_multipart(body, ctype)
            # не держим всё тело дольше нужного — files уже извлечены
            del body

            insert_raw = (fields.get("insert_before_last") or ["1"])[0]
            insert_before_last = str(insert_raw) in ("1", "true", "True", "yes")

            # только поле files (игнорируем прочие вложения без имени файлов уже отфильтрованы)
            file_items = [(name, data) for name, data in files if name]
            result = process_upload(file_items, insert_before_last)
            self._send_json(200, result)
        except Exception as exc:
            traceback.print_exc()
            self._send_json(400, {"ok": False, "error": str(exc)})
        finally:
            UPLOAD_LOCK.release()


def main():
    if not SLIDES_DIR.is_dir():
        print(f"Ошибка: нет папки {SLIDES_DIR}")
        sys.exit(1)
    if not MANIFEST_PATH.is_file():
        print(f"Ошибка: нет файла {MANIFEST_PATH}")
        sys.exit(1)

    try:
        server = ThreadingHTTPServer((HOST, PORT), AlbumHandler)
    except OSError as exc:
        print(f"Ошибка: не удалось занять {HOST}:{PORT} — {exc}")
        print("Возможно, порт уже занят. Закройте предыдущий запуск.")
        sys.exit(1)

    print()
    print(" Фотоальбом Ани — локальный сервер")
    print(" ---------------------------------")
    print(f" Корень:  {ROOT}")
    print(f" Сайт:    http://{HOST}:{PORT}/anna_slideshow/")
    print(f" API:     http://{HOST}:{PORT}/api/upload")
    print(" Остановка: Ctrl+C")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
