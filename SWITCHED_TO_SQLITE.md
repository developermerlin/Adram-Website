# ✅ Switched to SQLite - No PostgreSQL Needed!

## What Changed

Your `backend/settings.py` database configuration has been changed:

### Before
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'adram_db',
        ...
    }
}
```

### After (Now)
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

---

## ✅ Benefits

- ✅ **No PostgreSQL needed** - Works out of the box
- ✅ **Perfect for development** - Faster setup
- ✅ **Already installed** - SQLite comes with Python
- ✅ **File-based database** - Automatic backup (`db.sqlite3`)
- ✅ **Fast development** - No service management

---

## 🚀 How to Use

### Step 1: Run Migrations

**Option A: Batch File (Easiest)**
```
Double-click: RUN_MIGRATIONS.bat
```

**Option B: Manual**
```bash
cd backend
env\Scripts\activate
python manage.py makemigrations
python manage.py migrate
```

### Step 2: Create Admin User
```bash
python manage.py createsuperuser
```

### Step 3: Start Server
```bash
python manage.py runserver
```

---

## 📁 Database File

The SQLite database is stored at:
```
backend/db.sqlite3
```

This is automatically created and managed by Django.

---

## 🔄 When You Need PostgreSQL

For **production**, you can switch back to PostgreSQL:

1. Install PostgreSQL
2. Create database: `CREATE DATABASE adram_db;`
3. Update settings.py - uncomment PostgreSQL section
4. Run migrations again

---

## ⚠️ Important

**DO NOT delete `db.sqlite3`** - That's your database file with all your data!

---

## 📊 What to Do NOW

### Just Run This:

```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend"
env\Scripts\activate
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Then in a new terminal:
```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\frontend\frontend"
npm run dev
```

---

## ✅ Result

Your ADRAM app will be running at:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs/
- **Admin**: http://localhost:8000/admin/

---

## 🎉 No More PostgreSQL Errors!

The error "Connection refused on port 5432" is gone!

Your app is now ready to develop with. 🚀
