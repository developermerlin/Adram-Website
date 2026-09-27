# Database Configuration - Fixed ✅

## What Was Changed

### Before (Environment Variables)
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'adram_db'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'rootadmin1'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}
```

### After (Hard-Coded Values)
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'adram_db',
        'USER': 'postgres',
        'PASSWORD': 'rootadmin1',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

## Current Database Credentials

- **Database Name**: `adram_db`
- **Database User**: `postgres`
- **Password**: `rootadmin1`
- **Host**: `localhost`
- **Port**: `5432`

---

## What You Need to Do

### Step 1: Create Database (if not already created)

Open **SQL Shell (psql)**:
```sql
CREATE DATABASE adram_db;
```

### Step 2: Test Connection

```bash
cd backend
python manage.py dbshell
```

This should open a PostgreSQL shell if connection works.

Exit: `\q`

### Step 3: Run Migrations

```bash
python manage.py migrate
```

### Step 4: Start Server

```bash
python manage.py runserver
```

Should work without database errors now!

---

## Later - Setup Environment Variables

When you're ready to use environment variables:

1. Create `.env` file in `backend/` folder
2. Add these lines:
```
DB_NAME=adram_db
DB_USER=postgres
DB_PASSWORD=rootadmin1
DB_HOST=localhost
DB_PORT=5432
```

3. Update `settings.py` back to:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'adram_db'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'rootadmin1'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}
```

4. Install `python-decouple`:
```bash
pip install python-decouple
```

5. Add to top of `settings.py`:
```python
from decouple import config

# Then use:
'NAME': config('DB_NAME'),
'USER': config('DB_USER'),
```

---

## Right Now - Just Focus On

✅ Creating the database: `CREATE DATABASE adram_db;`
✅ Running migrations: `python manage.py migrate`
✅ Starting server: `python manage.py runserver`

**That's it! Everything else is configured.** 🎉
