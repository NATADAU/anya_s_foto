# Фотоальбом Ани

Локальный сайт-слайдшоу с возможностью добавлять фотографии через браузер.

## Состав

- `anna_slideshow/` — сайт (HTML/CSS/JavaScript)
- `album_slides/` — изображения WebP и `manifest.json`
- `album_server.py` — локальный сервер (просмотр + загрузка фото)
- `start_slideshow.bat` — запуск на Windows

## Локальный запуск (Windows)

1. Установите Python 3 и библиотеку Pillow (в проекте удобно использовать папку `.venv`).
2. Дважды щёлкните `start_slideshow.bat`.
3. Откроется `http://127.0.0.1:8765/anna_slideshow/`.

## GitHub Pages

Сайт можно открыть как статическое слайдшоу (без загрузки новых фото — для загрузки нужен локальный сервер).

Папка сайта: `/anna_slideshow/`  
Пути к кадрам настроены относительно неё: `../album_slides/`.

В настройках репозитория: **Settings → Pages → Deploy from branch `main` / root**.
Затем откройте: `https://natadau.github.io/anya_s_foto/anna_slideshow/`
