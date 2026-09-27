# Next Steps - Get Everything Running

## ✅ What Was Just Fixed

Your `backend/settings.py` now uses **hard-coded database credentials** instead of environment variables.

Database Configuration:
```
Database: adram_db
User: postgres
Password: rootadmin1
Host: localhost
Port: 5432
```

---

## 🚀 To Get Your App Running

### Step 1: Create PostgreSQL Database (2 minutes)

Open **SQL Shell (psql)** from Start Menu:
```sql
CREATE DATABASE adram_db;
\q
```

### Step 2: Run Backend

```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend"
env\Scripts\activate
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

**Backend at**: http://localhost:8000

### Step 3: Run Frontend (New Terminal)

```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\frontend\frontend"
npm run dev
```

**Frontend at**: http://localhost:5173

---

## 🎯 Done!

Access your application:
- **Landing Page**: http://localhost:5173
- **Login**: http://localhost:5173/login
- **API Docs**: http://localhost:8000/docs/
- **Admin Panel**: http://localhost:8000/admin/

---

## 📝 When Creating Superuser

```
Email: admin@example.com
Password: AdminPass123!
```

Use this to login.

---

## ⚠️ If You Still Get Database Error

**PostgreSQL not running?**
```bash
net start postgresql-x64-14
```

**Database doesn't exist?**
```sql
psql -U postgres
CREATE DATABASE adram_db;
\q
```

**Connection refused?**
- Check PostgreSQL is running
- Verify credentials match (postgres / rootadmin1)

---

## 🎉 Ready!

Everything is configured. Just create the database and start the servers!
