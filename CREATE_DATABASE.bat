@echo off
REM Create ADRAM Database - Run this as Administrator
REM ====================================================

echo.
echo ====================================================
echo ADRAM Database Setup
echo ====================================================
echo.
echo This will create the 'adram_db' database in PostgreSQL
echo.
echo Make sure PostgreSQL is running!
echo.

REM Start PostgreSQL service (if not running)
echo Starting PostgreSQL service...
net start postgresql-x64-14

echo.
echo Waiting for PostgreSQL to start...
timeout /t 3

echo.
echo Creating database using Python script...
echo.

REM Navigate to backend and run Python script
cd /d "%~dp0backend"

REM Activate virtual environment
call env\Scripts\activate.bat

REM Run the database creation script
python create_database.py

echo.
echo ====================================================
if %ERRORLEVEL% EQU 0 (
    echo ✅ Database created successfully!
    echo.
    echo Next steps:
    echo 1. Run: python manage.py migrate
    echo 2. Run: python manage.py createsuperuser
    echo 3. Run: python manage.py runserver
) else (
    echo ❌ Error creating database
    echo.
    echo Troubleshooting:
    echo 1. Make sure PostgreSQL is installed
    echo 2. Make sure password is: rootadmin1
    echo 3. Try running this script as Administrator
)
echo ====================================================
echo.

pause
