@echo off
cd /d "%~dp0"
call env\Scriptsctivate.bat
python manage.py runserver
