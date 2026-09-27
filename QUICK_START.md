# ADRAM - Quick Start Guide

## Backend - Start Here

```bash
# 1. Open terminal and go to backend
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend"

# 2. Activate virtual environment
env\Scripts\activate

# 3. Install dependencies (first time only)
pip install -r requirements.txt

# 4. Run migrations (first time only)
python manage.py makemigrations
python manage.py migrate

# 5. Create admin user (first time only)
python manage.py createsuperuser

# 6. Start server
python manage.py runserver
```

**Backend runs at**: http://localhost:8000

---

## Frontend - Start Here

```bash
# 1. Open NEW terminal and go to frontend
cd "c:\Users\Ardy Tech\Desktop\Adram Website\frontend\frontend"

# 2. Install dependencies (first time only)
npm install

# 3. Start dev server
npm run dev
```

**Frontend runs at**: http://localhost:5173

---

## What You Can Access

### Backend
- **Admin Panel**: http://localhost:8000/admin/
- **API Docs**: http://localhost:8000/docs/
- **API Base**: http://localhost:8000/api/v1/

### Frontend
- **Landing Page**: http://localhost:5173/
- **Login**: http://localhost:5173/login
- **Register**: http://localhost:5173/register
- **Student Dashboard**: http://localhost:5173/student/dashboard

---

## Test Login

Use the admin account you created:
- **Email**: admin@example.com (or whatever you set)
- **Password**: The password you created

---

## Project Structure

```
api/                        ← Central API router
├── urls.py               ← All routes here
└── apps.py

accounts/                   ← User authentication
├── models.py
├── views.py
├── serializers.py
├── urls.py
└── permissions.py

backend/                    ← Settings
├── settings.py           ← Django config
└── urls.py               ← Main router
```

---

## API Documentation

**Best way to test APIs**: http://localhost:8000/docs/

Swagger provides:
- All endpoints
- Request/response formats
- "Try it out" button
- Full interactive testing

---

## Problem? Try These

**Backend won't start?**
- Make sure PostgreSQL is running
- Check if port 8000 is free: `python manage.py runserver 8001`

**Frontend won't start?**
- Delete node_modules: `rmdir /s node_modules`
- Reinstall: `npm install`
- Try different port: `npm run dev -- --port 5174`

**"No module" error?**
- Activate venv: `env\Scripts\activate`
- Install packages: `pip install -r requirements.txt`

---

## Important Files

| File | Purpose |
|------|---------|
| `backend/settings.py` | Django configuration |
| `backend/urls.py` | Main URL router |
| `api/urls.py` | All API routes |
| `accounts/urls.py` | Auth routes |
| `requirements.txt` | Python packages |
| `frontend/src/App.jsx` | React routing |
| `frontend/src/services/api.js` | API client |

---

## Key Endpoints

```
POST   /api/v1/auth/register/        Register user
POST   /api/v1/auth/login/           Login user
GET    /api/v1/auth/profile/         Get profile
PUT    /api/v1/auth/profile/update/  Update profile
POST   /api/v1/auth/logout/          Logout
```

---

## Next Steps

1. ✅ Start backend and frontend
2. ✅ Test API at /docs/
3. ✅ Create test accounts
4. ✅ Test login flow
5. ✅ Explore admin panel
6. ⏳ Phase 2: Scholarships
7. ⏳ Phase 3: Applications
8. ⏳ Phase 4: Payments

---

## Useful Terminal Commands

```bash
# Backend
python manage.py runserver              # Start server
python manage.py createsuperuser        # Create admin
python manage.py migrate                # Apply migrations
python manage.py makemigrations         # Create migrations

# Frontend
npm run dev                              # Start dev
npm run build                            # Build for prod
npm install                              # Install packages
npm run lint                             # Check code
```

---

**Everything is ready! Start both servers and visit http://localhost:5173** 🚀
