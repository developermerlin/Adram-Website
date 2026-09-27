# DO THIS NOW - Fix Database Error (3 Steps)

## Step 1: Open Command Prompt as Administrator

- Press `Win + R`
- Type `cmd`
- Press `Ctrl + Shift + Enter` to run as Administrator

---

## Step 2: Start PostgreSQL Service

Copy and paste this command:
```bash
net start postgresql-x64-14
```

Press Enter. Wait for it to say "started" or "already running".

---

## Step 3: Create Database

Copy and paste this command:
```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend" && env\Scripts\activate && python create_database.py
```

Press Enter. Wait for it to say: **"✅ Database 'adram_db' created successfully!"**

---

## Done! ✅

Now run your backend:
```bash
python manage.py migrate
python manage.py runserver
```

---

## If Step 3 Fails

Try Option 2: Run the batch file

1. Go to: `C:\Users\Adram Website`
2. Right-click: **`CREATE_DATABASE.bat`**
3. Select: **"Run as administrator"**

---

That's it! After this, your database will exist and Django will work.
