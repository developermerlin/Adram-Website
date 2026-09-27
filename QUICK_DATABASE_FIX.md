# Quick Database Fix - 2 Minutes

## The Problem
```
FATAL: database "adram_db" does not exist
```

## The Solution

### Step 1: Open PostgreSQL Command Line

**On Windows**:
- Search for **"SQL Shell (psql)"** in Start Menu
- Or press `Win + R` and type: `cmd` and then type `psql -U postgres`

You'll see:
```
postgres=#
```

### Step 2: Create Database

Copy and paste this command:
```sql
CREATE DATABASE adram_db;
```

Press Enter. You should see:
```
CREATE DATABASE
```

### Step 3: Done!

Exit psql:
```sql
\q
```

---

## Now Try Django

Go back to your terminal where Django failed:

```bash
python manage.py runserver
```

It should work now!

---

## If It Still Doesn't Work

### Check PostgreSQL is Running

**Windows Command Prompt (as Admin)**:
```bash
net start postgresql-x64-14
```

### Verify Database Exists

In psql:
```sql
\l
```

You should see `adram_db` in the list.

### Check Credentials

Make sure these match:
- Database name: `adram_db` ✓
- User: `postgres` ✓
- Password: `rootadmin1` ✓ (default during install)
- Host: `localhost` ✓
- Port: `5432` ✓

---

## Still Stuck?

If database won't create, try this:

```sql
DROP DATABASE IF EXISTS adram_db;
CREATE DATABASE adram_db;
```

Then run Django:
```bash
python manage.py migrate
```

---

**That's it! Your database is ready.** 🎉
