# ADRAM Frontend Setup & Documentation

## Quick Start

### 1. Install Dependencies
```bash
cd frontend/frontend
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local`:
```
VITE_API_URL=http://localhost:8000/api
```

### 3. Run Development Server
```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

## Project Structure

```
frontend/src/
├── pages/
│   ├── HomePage.jsx           # Home page
│   ├── LoginPage.jsx          # Login form
│   ├── RegisterPage.jsx       # Registration form
│   ├── StudentDashboard.jsx   # Student dashboard
│   ├── AdminDashboard.jsx     # Admin dashboard
│   ├── ProfilePage.jsx        # Profile & settings
│   └── NotFoundPage.jsx       # 404 & 403 pages
├── components/
│   └── ProtectedRoute.jsx     # Route protection component
├── context/
│   └── AuthContext.jsx        # Authentication context & hooks
├── services/
│   └── api.js                 # Axios API client
└── App.jsx                    # Main app with routing
```

## Authentication Flow

### 1. Registration
- User fills registration form
- API validates and creates user
- JWT tokens stored in localStorage
- Auto-redirected to dashboard

### 2. Login
- User enters email and password
- API returns access and refresh tokens
- User data stored in context
- Route redirects based on role

### 3. Token Management
- Access token: 60 minutes lifetime
- Refresh token: 7 days lifetime
- Auto-refresh on 401 response
- Manual logout blacklists token

## Protected Routes

Routes that require authentication:
- `/student/dashboard` - Students only
- `/admin/dashboard` - Admins only
- `/profile` - All authenticated users

Redirect behavior:
- Unauthenticated → `/login`
- Wrong role → `/unauthorized`
- Authenticated at login/register → Dashboard

## Available Pages

### Public Pages
- `/` - Home page
- `/login` - Login form
- `/register` - Registration form

### Protected Pages
- `/student/dashboard` - Student main dashboard
- `/admin/dashboard` - Admin user management
- `/profile` - Profile & security settings

### Error Pages
- `/unauthorized` - 403 access denied
- `*` - 404 not found

## Features

### Authentication Context (useAuth)
```javascript
const { 
  user,              // Current user object
  loading,           // Loading state
  isAuthenticated,   // Auth status
  login,             // Login function
  logout,            // Logout function
  register,          // Register function
  updateProfile,     // Update profile
  changePassword     // Change password
} = useAuth();
```

### API Service
```javascript
// All API calls through authAPI
authAPI.login(email, password)
authAPI.register(formData)
authAPI.logout(refreshToken)
authAPI.getProfile()
authAPI.updateProfile(data)
authAPI.changePassword(data)
authAPI.getUsers(role, search)
```

## Styling

Uses Tailwind CSS utility classes for styling. Customize in `src/index.css`.

## Toast Notifications

Uses react-hot-toast for notifications. Triggered on:
- Login success/failure
- Registration success/failure
- Profile update
- Password change

## Dependencies

- **react**: UI library
- **react-router-dom**: Routing
- **axios**: HTTP client
- **zustand**: State management (future)
- **react-hot-toast**: Notifications
- **tailwind css**: Styling (via CDN in index.css)

## Development Tips

1. Update `.env.local` to change API endpoint
2. Check localStorage for tokens during debugging
3. Use browser DevTools to inspect API calls
4. Check console for authentication errors
5. Test role-based access with different accounts

## Production Deployment

1. Build the app: `npm run build`
2. Deploy `dist/` folder to hosting
3. Update `VITE_API_URL` in production environment
4. Ensure CORS is properly configured on backend
