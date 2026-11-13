# PaisaTrack

PaisaTrack stores transactions, budgets, and savings goals per account. The app does not load sample financial records and does not connect to bank accounts.

## Run locally

Use Node.js 22.13 or newer.

1. Start the API:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

2. In a second terminal, start the UI:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

3. Open the Vite URL shown in the second terminal, create an account, and add your own records.

The development server proxies `/api` requests to `http://127.0.0.1:3001`. SQLite data is stored in `backend/data/paisatrack.sqlite` and is ignored by Git.

## Production

Build the UI, then run the API server from the project root:

```sh
cd frontend && npm run build
cd ../backend && NODE_ENV=production npm start
```

The API server serves `frontend/dist` when it exists. Set `PORT` and `DATABASE_PATH` as needed. Production must use HTTPS because the session cookie is marked `Secure` when `NODE_ENV=production`.

Passwords are hashed before storage. Sessions use an HttpOnly, SameSite=Lax cookie, and every financial query is scoped to the signed-in account. Do not put bank passwords or API secrets in this app; direct bank sync is not configured.
