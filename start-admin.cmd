@echo off
rem Запуск сервера панели управления «Сомной_легко».
rem Двойной клик по этому файлу поднимает сайт и панель на localhost.

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python не найден. Установите Python 3.10 или новее с python.org
  pause
  exit /b 1
)

echo Запускаем сервер панели...
start "" http://localhost:8787/admin
python server\app.py

pause
