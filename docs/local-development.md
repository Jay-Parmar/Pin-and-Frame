# Run Pin & Frame on Windows

Use Python 3.13, PostgreSQL 17, and Node.js 24 LTS. Start PostgreSQL on `127.0.0.1:5432`.

## Database

Connect as your local PostgreSQL administrator with `psql -U postgres`. Run the following and choose a password when prompted.

```sql
CREATE ROLE pinframe LOGIN;
\password pinframe
CREATE DATABASE pinframe OWNER pinframe;
```

## Django

From the repository root in PowerShell, install the backend dependencies and set the local environment.

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
$env:POSTGRES_PASSWORD = Read-Host 'PostgreSQL password for pinframe' -MaskInput
$env:PINFRAME_SECRET_KEY = .\.venv\Scripts\python -c 'import secrets; print(secrets.token_urlsafe(48))'
.\.venv\Scripts\python backend\manage.py migrate
.\.venv\Scripts\python backend\manage.py createsuperuser
.\.venv\Scripts\python backend\manage.py runserver 127.0.0.1:8000
```

Use the Django superuser credentials in the app. Reuse the Django secret between runs to keep existing sessions. Set `POSTGRES_PORT` if your local port differs. The media directory defaults to `.pin-and-frame/media` under your user folder. You can set `PINFRAME_MEDIA_ROOT` to another folder outside the checkout.

## React

Open a second PowerShell window at the repository root.

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Use `npm run build` to check the frontend build.
