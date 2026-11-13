# PaisaTrack

PaisaTrack is a personal finance dashboard for recording income and expenses, setting monthly budgets, and tracking savings goals. Each account sees only its own records. Transactions are entered manually; bank syncing is not configured.

## Features

- Create an account and sign in with email and password.
- Record income and expenses with a category, amount, and date.
- Review balances, income, expenses, savings rate, category breakdowns, and monthly cash flow.
- Create monthly budgets and track spending against them.
- Create savings goals and record contributions.
- Search and export your transactions as CSV.
- Use the responsive dashboard on desktop and mobile.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Lucide icons
- **Backend:** Node.js, Express
- **Database:** SQLite

## Requirements

- Node.js 22.13 or newer
- npm

## Run locally

Open two terminals from the project root.

**Terminal 1 — API and database**

```sh
cd backend
npm install
npm run dev
```

The API starts at `http://localhost:3001`. By default, the SQLite database is created at `backend/data/paisatrack.sqlite`.

**Terminal 2 — web app**

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, create an account, and add your own financial records. The frontend development server proxies `/api` requests to the local API.

## Production

Build the frontend and then start the backend:

```sh
cd frontend
npm run build

cd ../backend
NODE_ENV=production npm start
```

The backend serves the built app from `frontend/dist`. In production, serve the site over HTTPS because the session cookie is marked `Secure`.

Configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port used by the API server |
| `DATABASE_PATH` | `backend/data/paisatrack.sqlite` | Path to the SQLite database file |
| `NODE_ENV` | — | Set to `production` to enable production cookie and security settings |

## API overview

Except for health and sign-in/sign-up routes, API requests require an authenticated session.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Check API availability |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Get the current account |
| `GET` | `/api/dashboard?period=thismonth` | Get account summary and dashboard data |
| `GET`, `POST` | `/api/transactions` | List or add transactions |
| `DELETE` | `/api/transactions/:id` | Delete a transaction |
| `GET`, `POST` | `/api/budgets` | List or create budgets |
| `DELETE` | `/api/budgets/:id` | Delete a budget |
| `GET`, `POST` | `/api/goals` | List or create savings goals |
| `POST` | `/api/goals/:id/contributions` | Add savings to a goal |
| `DELETE` | `/api/goals/:id` | Delete a savings goal |

Dashboard periods are `thismonth`, `last30days`, and `thisyear`.

## Security and privacy

- Passwords are hashed before they are stored.
- Sign-in uses an HttpOnly, SameSite session cookie; only a hash of the session token is stored in the database.
- Financial records and dashboard queries are scoped to the signed-in account.
- The database file is local application data and should not be committed or shared.
- PaisaTrack does not ask for bank passwords and does not currently connect to bank accounts.

## Checks

Run the backend tests:

```sh
cd backend
npm test
```

Lint and build the frontend:

```sh
cd frontend
npm run lint
npm run build
```
