# ADRAM Technologies - Complete Setup Instructions

## Phase 1: Foundation - Setup Guide

### Backend Setup

#### Step 1: Navigate to Backend
```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\backend"
```

#### Step 2: Activate Virtual Environment
```bash
env\Scripts\activate
```

#### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

#### Step 4: Create Environment File
Copy `.env.example` to `.env` and update with your values:
```bash
DEBUG=True
SECRET_KEY=your-secret-key
DB_NAME=adram_db
DB_USER=postgres
DB_PASSWORD=rootadmin1
DB_HOST=localhost
DB_PORT=5432
```

#### Step 5: Run Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

#### Step 6: Create Admin User
```bash
python manage.py createsuperuser
# Follow the prompts to create an admin account
```

#### Step 7: Start Server
```bash
python manage.py runserver
```

Backend will run at: **http://localhost:8000**

### Frontend Setup

#### Step 1: Navigate to Frontend
```bash
cd "c:\Users\Ardy Tech\Desktop\Adram Website\frontend\frontend"
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Create Environment File
Copy `.env.example` to `.env.local`:
```
VITE_API_URL=http://localhost:8000/api
```

#### Step 4: Start Dev Server
```bash
npm run dev
```

Frontend will run at: **http://localhost:5173**

---

## Access Points

### Backend
- **API Base**: http://localhost:8000/api/v1/
- **Admin Panel**: http://localhost:8000/admin/
- **API Docs (Swagger)**: http://localhost:8000/docs/
- **API Docs (ReDoc)**: http://localhost:8000/redoc/

### Frontend
- **Landing Page**: http://localhost:5173/
- **Login**: http://localhost:5173/login
- **Register**: http://localhost:5173/register
- **Student Dashboard**: http://localhost:5173/student/dashboard
- **Admin Dashboard**: http://localhost:5173/admin/dashboard

---

## Test Accounts

After creating a superuser, login to admin and create test accounts:

**Student Account**
- Email: student@example.com
- Password: StudentPass123!
- Role: STUDENT

**Admin Account**
- Email: admin@example.com
- Password: AdminPass123!
- Role: ADMIN

---

## Database Setup (PostgreSQL)

### 1. Install PostgreSQL
Download from: https://www.postgresql.org/download/

### 2. Create Database
```sql
CREATE DATABASE adram_db;
```

### 3. Create User
```sql
CREATE USER postgres WITH PASSWORD 'rootadmin1';
ALTER ROLE postgres SET client_encoding TO 'utf8';
ALTER ROLE postgres SET default_transaction_isolation TO 'read committed';
ALTER ROLE postgres SET default_transaction_deferrable TO on;
ALTER ROLE postgres SET default_transaction_read_committed TO on;
GRANT ALL PRIVILEGES ON DATABASE adram_db TO postgres;
```

---

## API Testing

### Using Swagger UI (Recommended)
1. Open: http://localhost:8000/docs/
2. Click "Authorize" button
3. Login or register to get JWT token
4. Use "Try it out" on any endpoint

### Using cURL
```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "first_name": "Test",
    "last_name": "User",
    "password": "TestPass123!",
    "password_confirm": "TestPass123!"
  }'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

### Using Postman
1. Install Postman: https://www.postman.com/downloads/
2. Create new request
3. Set method to POST
4. URL: http://localhost:8000/api/v1/auth/login/
5. Body (JSON):
```json
{
  "email": "admin@example.com",
  "password": "AdminPass123!"
}
```
6. Send request and copy access token
7. For authenticated requests, add header:
```
Authorization: Bearer {access_token}
```

---

## Project Structure

```
Adram Website/
├── backend/                    # Django backend
│   ├── api/                   # Centralized API router
│   ├── accounts/              # User authentication
│   ├── backend/               # Settings
│   ├── manage.py
│   ├── requirements.txt
│   └── env/                   # Virtual environment
│
├── frontend/
│   └── frontend/              # React frontend
│       ├── src/
│       ├── public/
│       ├── package.json
│       └── node_modules/
│
└── Documentation files
    ├── BACKEND_STRUCTURE.md
    ├── BACKEND_SETUP.md
    ├── FRONTEND_SETUP.md
    └── PROJECT_SUMMARY.md
```

---

## Troubleshooting

### Backend Issues

**Error: ModuleNotFoundError**
- Solution: Activate virtual environment and reinstall: `pip install -r requirements.txt`

**Error: Database connection refused**
- Solution: Ensure PostgreSQL is running
- Windows: Check Services (services.msc)
- Update DB credentials in .env

**Error: Port 8000 already in use**
- Solution: `python manage.py runserver 8001`

### Frontend Issues

**Error: Dependencies not found**
- Solution: Delete node_modules and reinstall: `npm install`

**Error: API connection failed**
- Solution: Check VITE_API_URL in .env.local
- Ensure backend is running

**Error: Port 5173 already in use**
- Solution: `npm run dev -- --port 5174`

---

## Useful Commands

### Backend
```bash
# Create app
python manage.py startapp appname

# Make migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver

# Run tests
python manage.py test

# Collect static files
python manage.py collectstatic
```

### Frontend
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview build
npm run preview

# Lint
npm run lint
```

---

## Next Steps

1. ✅ Test all API endpoints
2. ✅ Create test user accounts
3. ✅ Test authentication flow
4. ✅ Test protected routes
5. ✅ Customize frontend styling
6. ⏳ Phase 2: Scholarship Management
7. ⏳ Phase 3: Student Applications
8. ⏳ Phase 4: Payment Processing

---

## Support & Documentation

- **Django Docs**: https://docs.djangoproject.com/
- **Django REST Framework**: https://www.django-rest-framework.org/
- **React Docs**: https://react.dev
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

---

**Last Updated**: January 2024
**Status**: ✅ Ready for Development
