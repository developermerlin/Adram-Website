# How to Fix: "database adram_db does not exist"

## The Problem

```
FATAL:  database "adram_db" does not exist
```

This means PostgreSQL is either:
1. Not running
2. Database wasn't created
3. Wrong password

---

## Solution - 3 Options

### ✅ Option 1: Automatic Python Script (RECOMMENDED)

1. Open Command Prompt **as Administrator**
2. Navigate to: `C:\Users\Ardy Tech\Desktop\Adram Website\backend`
3. Run:
```bash
env\Scripts\activate
python create_database.py
```

This script will:
- Check if PostgreSQL is running
- Create the database automatically
- Show you if it worked

---

### ✅ Option 2: Batch File (Easiest)

1. Go to: `C:\Users\Ardy Tech\Desktop\Adram Website`
2. Double-click: **`CREATE_DATABASE.bat`**
3. It will:
   - Start PostgreSQL service
   - Create the database
   - Show results

**Important**: Right-click and select "Run as Administrator"

---

### ✅ Option 3: Manual SQL (Most Control)

#### Step 1: Open pgAdmin
- Search for **pgAdmin** in Start Menu
- Login with postgres / rootadmin1

#### Step 2: Create Database
1. Click **Servers** on left
2. Click **PostgreSQL**
3. Right-click **Databases**
4. Select **Create** → **Database**
5. Name: `adram_db`
6. Click **Save**

---

## Verify It Works

After creating the database, run:

```bash
cd backend
env\Scripts\activate
python manage.py dbshell
```

You should see:
```
psql (...)
adram_db=>
```

If yes, database is created! Exit with `\q`

---

## Then Run Django

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

---

## Still Getting the Error?

### Check 1: Is PostgreSQL Running?

Windows Command Prompt (as Administrator):
```bash
net start postgresql-x64-14
```

You should see: "The PostgreSQL Database Server instance (postgresql-x64-14) service is starting."

### Check 2: Is Password Correct?

Default when installed: `postgres` / `password`

But we set it to: `postgres` / `rootadmin1`

If you don't remember, you need to reset PostgreSQL password.

### Check 3: Is Port Available?

Default: `5432`

Check if something else is using it. In settings.py we use port 5432.

---

## If Python Script Fails

The script will tell you what's wrong. Common issues:

**"Connection refused"**
- PostgreSQL not running
- Use: `net start postgresql-x64-14`

**"Password authentication failed"**
- Wrong password
- Default is usually: postgres
- We configured: rootadmin1

**"cannot connect to server"**
- PostgreSQL not installed
- Download: https://www.postgresql.org/download/windows/

---

## PostgreSQL Password

If you forgot the password, you have two options:

### Option A: Reinstall PostgreSQL
- Uninstall: Settings → Apps → PostgreSQL
- Reinstall: https://www.postgresql.org/download/windows/
- During install, set password to: `rootadmin1`

### Option B: Reset Password in pgAdmin
1. Open pgAdmin
2. Right-click postgres user
3. Properties → Password
4. Set to: `rootadmin1`
5. Click OK

---

## One-Line Summary

**Run this ONE command** (as Administrator):

```bash
python create_database.py
```

If it works, you'll see: "✅ Database 'adram_db' created successfully!"

Then you're done! 🎉

---

## Next Steps After Database is Created

```bash
# In backend folder
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Then open new terminal:
```bash
# In frontend/frontend folder  
npm run dev
```

Your app will be at: http://localhost:5173

---

## Files That Help

- `create_database.py` - Python script to create DB
- `CREATE_DATABASE.bat` - Batch file (run as Admin)
- This file - Complete guide

**Just run the batch file and you're done!** 🚀
