# Run Pin & Frame on Windows

Use Python 3.13, PostgreSQL 17, and Node.js 24 LTS. Start PostgreSQL on `127.0.0.1:5432`.

## Database

Connect as your local PostgreSQL administrator with `psql -h 127.0.0.1 -U postgres`. Run the following and choose a password when prompted.

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
$databasePassword = Read-Host 'PostgreSQL password for pinframe' -AsSecureString
$env:POSTGRES_PASSWORD = [System.Net.NetworkCredential]::new('', $databasePassword).Password
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
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`.

## Import a trip

1. Create a trip under **Trips**. You can add stops now or during review.
2. Open **Import photos for this trip** and select a source. Copy the command into a PowerShell window at the repository root with the same Django and PostgreSQL environment values. Replace the sample path with your actual folder or Instagram ZIP.
3. Open **Imports**, choose the batch, and assign pending photos to stops. Check timestamps and GPS suggestions before accepting a match. Open **Archive** to see the approved photos by trip, visit, or place.

When importing a full account archive, you can append `--from-date YYYY-MM-DD` and `--to-date YYYY-MM-DD`. Instagram filters on when a post was published. Phone and Takeout imports use the available capture date. Photos with unknown dates remain available for review. Exact duplicates reuse the existing photo, and videos appear in the skipped count.

## Verify and restore

Run `.\.venv\Scripts\python backend\manage.py test` from the root with a local PostgreSQL test role that can create a database. From `frontend`, run `npm.cmd run build` for the TypeScript and production build checks.

Pause imports and edits before backing up. Save a PostgreSQL dump and copy the media directory into the same backup. Keep your source files in your existing backup.

```powershell
pg_dump -h 127.0.0.1 -U pinframe -Fc -f 'C:\backups\pinframe.dump' pinframe
```

For a restore check, create a fresh database owned by `pinframe`, then load the dump.

```powershell
createdb -h 127.0.0.1 -U postgres -O pinframe pinframe_restore
pg_restore -h 127.0.0.1 -U pinframe --no-owner --no-privileges -d pinframe_restore 'C:\backups\pinframe.dump'
```

Set `POSTGRES_DB` to `pinframe_restore` and `PINFRAME_MEDIA_ROOT` to the copied media directory. Start Django and confirm you can see a trip and open one of its photos.
