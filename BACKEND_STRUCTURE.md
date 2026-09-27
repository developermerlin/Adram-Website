# ADRAM Backend - Professional Project Structure

## Overview

The backend follows a clean, modular architecture with centralized API management.

## Directory Structure

```
backend/
├── manage.py                  # Django management script
├── requirements.txt           # Python dependencies
├── db.sqlite3                # Development database
│
├── api/                       # ✅ CENTRALIZED API MODULE
│   ├── __init__.py
│   ├── apps.py
│   └── urls.py               # All API routes defined here
│
├── accounts/                  # User & Authentication
│   ├── models.py             # User model, ActivityLog
│   ├── views.py              # API views
│   ├── serializers.py        # Data serializers
│   ├── permissions.py        # Role-based permissions
│   ├── validators.py         # Custom validators
│   ├── urls.py               # Auth-specific routes
│   ├── admin.py              # Django admin config
│   ├── apps.py
│   ├── migrations/
│   ├── tests.py
│   └── __init__.py
│
├── backend/                   # Project Settings
│   ├── settings.py           # Django configuration
│   ├── urls.py               # Main URL router
│   ├── wsgi.py
│   ├── asgi.py
│   └── __init__.py
│
└── env/                       # Virtual Environment
    └── (Python packages)
```

## API URL Structure

```
API Base: http://localhost:8000/api/v1/

Authentication:
  POST   /api/v1/auth/register/          - User registration
  POST   /api/v1/auth/login/             - User login
  POST   /api/v1/auth/logout/            - User logout
  POST   /api/v1/auth/token/refresh/     - Refresh token
  GET    /api/v1/auth/profile/           - Get profile
  PUT    /api/v1/auth/profile/update/    - Update profile
  POST   /api/v1/auth/change-password/   - Change password
  POST   /api/v1/auth/forgot-password/   - Reset password
  GET    /api/v1/auth/users/             - List users (admin)
  GET    /api/v1/auth/activity-logs/     - Activity logs

Documentation:
  GET    /docs/                          - Swagger UI
  GET    /redoc/                         - ReDoc UI
  GET    /swagger/                       - OpenAPI spec
```

## App Responsibilities

### `api/` App
**Purpose**: Centralized API routing and configuration
- **urls.py**: Routes all API requests to appropriate apps
- **apps.py**: App configuration
- No views or models here - acts as a router

### `accounts/` App
**Purpose**: User management and authentication
- **models.py**: User, ActivityLog models
- **views.py**: Authentication endpoints
- **serializers.py**: Data validation and transformation
- **permissions.py**: Role-based access control
- **validators.py**: Custom validation logic
- **urls.py**: Auth-specific routes (included in api/urls.py)
- **admin.py**: Django admin customization

## Settings Configuration

**File**: `backend/settings.py`

Key configurations:
- `INSTALLED_APPS`: Includes 'api' first, then 'accounts'
- `REST_FRAMEWORK`: DRF settings
- `SIMPLE_JWT`: JWT token configuration
- `DATABASES`: PostgreSQL setup
- `CORS_ALLOWED_ORIGINS`: Frontend URLs
- `LOGGING`: Activity tracking

## How It Works

1. **Request arrives** at http://localhost:8000/api/v1/auth/login/
2. **Main router** (backend/urls.py) routes to 'api/urls.py'
3. **API router** (api/urls.py) routes to 'accounts/urls.py'
4. **Accounts router** handles authentication endpoints
5. **View** processes request and returns response

## Installation & Setup

### 1. Activate Virtual Environment
```bash
cd backend
env\Scripts\activate  # Windows
source env/bin/activate  # Linux/Mac
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. Create Superuser
```bash
python manage.py createsuperuser
```

### 5. Start Server
```bash
python manage.py runserver
```

## API Documentation

Access at: **http://localhost:8000/docs/**

The Swagger UI provides interactive API documentation with:
- All available endpoints
- Request/response formats
- Try-it-out functionality
- Authentication setup

## Adding New APIs

### For new features in future phases:

1. **Create new app** (if needed):
   ```bash
   python manage.py startapp scholarships
   ```

2. **Add to INSTALLED_APPS** in settings.py

3. **Create models, views, serializers** in the new app

4. **Update api/urls.py**:
   ```python
   path('scholarships/', include('scholarships.urls')),
   ```

5. **Run migrations**:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

## Best Practices

✅ **All APIs centralized** in `api/urls.py`
✅ **Clear separation of concerns** - Each app has specific responsibility
✅ **DRY principle** - Views, serializers, validators are reusable
✅ **Security** - Permission classes control access
✅ **Documentation** - Swagger/ReDoc auto-generated
✅ **Modular** - Easy to add new features
✅ **Professional** - Follows Django best practices

## Troubleshooting

### Error: `ModuleNotFoundError: No module named 'api'`
- Ensure `api` is in `INSTALLED_APPS` in settings.py
- Check that `api/__init__.py` exists
- Verify `api/urls.py` exists

### Error: `ModuleNotFoundError: No module named 'drf_yasg'`
- Run: `pip install drf-yasg`
- Or: `pip install -r requirements.txt`

### JWT Token Issues
- Check `SIMPLE_JWT` settings in settings.py
- Verify token is in request headers: `Authorization: Bearer {token}`
- Check token expiration time

## Next Steps

Ready for Phase 2 implementation:
- Scholarship Management API
- Student Application API
- Document Upload API
- Payment Processing API

---

**Status**: ✅ Professional Structure Complete
**Last Updated**: January 2024
