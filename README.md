# ADRAM Technologies Web Portal

React (Vite) frontend and Django REST backend.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`. API calls to `/api` are proxied to Django on port 8000.

## Backend

```bash
cd backend
.\env\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

API docs: `http://127.0.0.1:8000/`
Auth: `http://127.0.0.1:8000/api/v1/auth/`
Contact: `http://127.0.0.1:8000/api/contact/`
