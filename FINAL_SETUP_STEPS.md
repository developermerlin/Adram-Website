# Final Setup - 4 Simple Steps

## You Don't Need PostgreSQL Anymore!

I've switched your project to **SQLite** - works instantly, no installation needed.

---

## Step 1: Run Migrations

**Option A: Easy (Batch File)**
```
Go to: C:\Users\Ardy Tech\Desktop\Adram Website\backend
Double-click: RUN_MIGRATIONS.bat
```

**Option B: Manual**
```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend"
env\Scripts\activate
python manage.py makemigrations
python manage.py migrate
```

---

## Step 2: Create Admin User

Still in the backend folder:
```bash
python manage.py createsuperuser
```

When prompted:
- Email: `admin@example.com`
- Password: `AdminPass123!`

---

## Step 3: Start Backend

```bash
python manage.py runserver
```

You should see:
```
Starting development server at http://127.0.0.1:8000/
```

---

## Step 4: Start Frontend (New Terminal)

```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\frontend\frontend"
npm run dev
```

You should see:
```
Local: http://localhost:5173/
```

---

## 🎉 Done!

Your app is now running!

### Access Points
- **Landing Page**: http://localhost:5173
- **Login**: http://localhost:5173/login
- **Dashboard**: http://localhost:5173/student/dashboard
- **Admin Panel**: http://localhost:8000/admin/
- **API Docs**: http://localhost:8000/docs/

---

## ✅ Test It

1. Go to http://localhost:5173
2. Click "Login"
3. Enter: admin@example.com / AdminPass123!
4. You should see the dashboard

---

## 📝 Important

**DO NOT delete `backend/db.sqlite3`** - That's your database!

---

## ✅ You're Done!

Everything is set up and ready to use. 🎉

No more PostgreSQL errors!
