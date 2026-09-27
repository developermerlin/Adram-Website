# ADRAM Backend Setup & API Documentation

## Quick Start

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure PostgreSQL
Create database and update .env:
```
DB_NAME=adram_db
DB_USER=postgres
DB_PASSWORD=rootadmin1
DB_HOST=localhost
DB_PORT=5432
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

## API Endpoints

### Authentication
- POST /api/auth/register/ - User registration
- POST /api/auth/login/ - User login
- POST /api/auth/logout/ - User logout
- POST /api/auth/token/refresh/ - Refresh JWT token

### Profile Management
- GET /api/auth/profile/ - Get current user profile
- PUT /api/auth/profile/update/ - Update user profile
- POST /api/auth/change-password/ - Change password
- POST /api/auth/forgot-password/ - Request password reset

### Admin
- GET /api/auth/users/ - List all users
- GET /api/auth/activity-logs/ - View activity logs

## User Roles
1. ADMIN - Full system access
2. SCHOLARSHIP_MANAGER - Manage scholarships
3. FINANCE_MANAGER - Manage payments
4. COUNSELLOR - Communicate with students
5. STUDENT - Apply for scholarships

## Database Models

### User
- id, email (unique), first_name, last_name, phone_number, country
- profile_picture, role, is_verified, is_active, created_at, updated_at

### ActivityLog
- user, action, description, ip_address, user_agent, timestamp

## JWT Token
- Access token lifetime: 60 minutes
- Refresh token lifetime: 7 days
- Include in headers: Authorization: Bearer {token}
