@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  Фотоальбом Ани — локальный запуск
echo  ---------------------------------
echo.

set "PY="
if exist "%~dp0.venv\Scripts\python.exe" (
  set "PY=%~dp0.venv\Scripts\python.exe"
) else (
  where python >nul 2>&1
  if errorlevel 1 (
    echo [Ошибка] Python не найден.
    echo Установите Python с https://www.python.org/downloads/
    echo При установке отметьте пункт "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
  )
  set "PY=python"
)

if not exist "anna_slideshow\index.html" (
  echo [Ошибка] Не найден файл anna_slideshow\index.html
  echo Запускайте этот файл из папки «Фотоальбом Аня С».
  echo.
  pause
  exit /b 1
)

if not exist "album_slides\manifest.json" (
  echo [Ошибка] Не найден album_slides\manifest.json
  echo.
  pause
  exit /b 1
)

if not exist "album_server.py" (
  echo [Ошибка] Не найден album_server.py
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":8765 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [Ошибка] Порт 8765 уже занят.
  echo Закройте программу, которая его использует, или завершите предыдущий запуск слайдшоу.
  echo.
  pause
  exit /b 1
)

echo  Сервер:   http://127.0.0.1:8765/
echo  Сайт:     http://127.0.0.1:8765/anna_slideshow/
echo  Остановка: закройте это окно или нажмите Ctrl+C
echo.

start "" "http://127.0.0.1:8765/anna_slideshow/"

"%PY%" "album_server.py"
set ERR=%ERRORLEVEL%

if not "%ERR%"=="0" (
  echo.
  echo [Ошибка] Не удалось запустить сервер ^(код %ERR%^).
  echo Возможно, порт 8765 занят или не установлен Pillow в окружении проекта.
  echo.
  pause
  exit /b %ERR%
)

endlocal
