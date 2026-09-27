# PostgreSQL Database Setup for ADRAM

## Error
```
django.db.utils.OperationalError: connection to server at "localhost" (::1), port 5432 failed: 
FATAL: database "adram_db" does not exist
```

**Solution**: Create the PostgreSQL database

---

## Step 1: Check if PostgreSQL is Running

### Windows
1. Press `Win + R`
2. Type `services.msc` and press Enter
3. Look for "PostgreSQL" service
4. If it's not running, right-click and select "Start"

Or open Command Prompt as Administrator and run:
```bash
net start postgresql-x64-14
```

---

## Step 2: Create Database and User

Open **pgAdmin** or **PostgreSQL Command Line** (psql)

### Option A: Using pgAdmin (GUI - Easiest)

1. Open pgAdmin (search in Start Menu)
2. Connect with default credentials:
   - Username: postgres
   - Password: (the password you set during PostgreSQL installation)

3. Right-click **Databases** → Select **Create** → **Database**

4. Fill in:
   - **Name**: `adram_db`
   - **Owner**: postgres
   - Click **Save**

### Option B: Using Command Line (psql)

1. Open Command Prompt as Administrator
2. Connect to PostgreSQL:
```bash
psql -U postgres
```

3. When prompted, enter your PostgreSQL password

4. Create the database:
```sql
CREATE DATABASE adram_db;
```

5. Verify it was created:
```sql
\l
```

You should see `adram_db` in the list.

6. Exit psql:
```sql
\q
```

---

## Step 3: Grant Permissions (if needed)

In pgAdmin or psql:

```sql
-- Connect to the database
\c adram_db

-- Grant all privileges to postgres user
GRANT ALL PRIVILEGES ON DATABASE adram_db TO postgres;

-- If you created a different user:
CREATE USER adramuser WITH PASSWORD 'adrampass123';
GRANT ALL PRIVILEGES ON DATABASE adram_db TO adramuser;
```

---

## Step 4: Verify Database Credentials

Your current settings expect:
```
Database: adram_db
User: postgres
Password: rootadmin1
Host: localhost
Port: 5432
```

Make sure these match what you set in PostgreSQL!

If they don't match, update your `.env` file:
```
DB_NAME=adram_db
DB_USER=postgres
DB_PASSWORD=rootadmin1
DB_HOST=localhost
DB_PORT=5432
```

Or edit `backend/settings.py` DATABASES section

---

## Step 5: Run Django Migrations

Once the database exists, run:

```bash
cd backend
env\Scripts\activate
python manage.py migrate
```

This will create all necessary tables.

---

## Step 6: Verify Connection

```bash
python manage.py dbshell
```

This should open a PostgreSQL shell if the connection works.

Exit with:
```
\q
```

---

## Troubleshooting

### "PostgreSQL service is not running"

**Windows**:
```bash
# As Administrator
net start postgresql-x64-14
```

Or use Services (services.msc) and start PostgreSQL manually.

### "Password authentication failed"

- Check your PostgreSQL password
- Make sure it matches in `.env` or settings.py
- Default username is `postgres`
- If you forgot the password, you'll need to reset it

### "Connection refused on port 5432"

- PostgreSQL is not running
- Or listening on different port (default is 5432)
- Or not installed

**Install PostgreSQL**:
1. Download: https://www.postgresql.org/download/windows/
2. Run installer
3. Remember the password you set!
4. Keep default port as 5432

### "database adram_db does not exist"

- Create database following steps above
- Or reset: `DROP DATABASE adram_db;` then `CREATE DATABASE adram_db;`

---

## Quick Reference

### Create Database (psql)
```sql
CREATE DATABASE adram_db;
```

### Drop Database (start fresh)
```sql
DROP DATABASE IF EXISTS adram_db;
CREATE DATABASE adram_db;
```

### Connect to Database
```sql
\c adram_db
```

### List All Databases
```sql
\l
```

### List Tables
```sql
\dt
```

### Exit psql
```sql
\q
```

---

## What Next?

Once database is created and Django connects:

```bash
# 1. Create tables
python manage.py migrate

# 2. Create admin user
python manage.py createsuperuser

# 3. Start server
python manage.py runserver
```

---

## Connection String

Your Django connection string:
```
postgresql://postgres:rootadmin1@localhost:5432/adram_db
```

If you change any credential, update both:
1. `.env` file
2. `backend/settings.py` DATABASES section

---

## GUI Tools to Manage Database

1. **pgAdmin** (comes with PostgreSQL)
   - Open from Start Menu
   - Web-based interface
   - User-friendly

2. **DBeaver** (free download)
   - https://dbeaver.io/
   - Advanced SQL editor
   - Great for developers

3. **HeidiSQL** (free)
   - https://www.heidisql.com/
   - Simple SQL management

---

## Important Files

| File | Purpose |
|------|---------|
| `backend/settings.py` | Database configuration |
| `.env` | Environment variables (optional) |
| `.env.example` | Template for .env |

---

**After creating the database, your Django app should connect successfully!**

Run: `python manage.py runserver`
