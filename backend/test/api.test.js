import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import { createDatabase } from '../src/database.js'

const db = createDatabase(':memory:')
const app = createApp({ db, cookieSecure: false })
let server
let baseUrl

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  db.close()
})

async function request(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (cookie) headers.set('Cookie', cookie)
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers })
  const body = response.status === 204 ? null : await response.json()
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

function json(method, value) {
  return { method, body: JSON.stringify(value) }
}

test('accounts persist their own transactions, budgets, and goals', async () => {
  const firstSignup = await request('/api/auth/register', json('POST', {
    name: 'Yesh User',
    email: 'yesh@example.com',
    password: 'a-strong-password-123',
  }))
  assert.equal(firstSignup.response.status, 201)
  assert.equal(firstSignup.body.user.email, 'yesh@example.com')
  assert.equal('password_hash' in firstSignup.body.user, false)
  assert.match(firstSignup.response.headers.get('set-cookie'), /HttpOnly/i)
  const firstCookie = firstSignup.cookie

  const duplicate = await request('/api/auth/register', json('POST', {
    name: 'Duplicate User',
    email: 'YESH@example.com',
    password: 'another-strong-password',
  }))
  assert.equal(duplicate.response.status, 409)

  const unauthenticated = await request('/api/dashboard')
  assert.equal(unauthenticated.response.status, 401)

  const addedTransaction = await request('/api/transactions', {
    ...json('POST', {
      name: 'Monthly pay',
      category: 'Salary',
      type: 'income',
      amount: 80000,
      date: new Date().toISOString().slice(0, 10),
    }),
    cookie: firstCookie,
  })
  assert.equal(addedTransaction.response.status, 201)

  const addedExpense = await request('/api/transactions', {
    ...json('POST', {
      name: 'Market',
      category: 'Groceries',
      type: 'expense',
      amount: 2500,
      date: new Date().toISOString().slice(0, 10),
    }),
    cookie: firstCookie,
  })
  assert.equal(addedExpense.response.status, 201)

  const budget = await request('/api/budgets', {
    ...json('POST', { name: 'Groceries', monthlyLimit: 12000 }),
    cookie: firstCookie,
  })
  assert.equal(budget.response.status, 201)

  const goal = await request('/api/goals', {
    ...json('POST', { name: 'Rainy day fund', targetAmount: 50000 }),
    cookie: firstCookie,
  })
  assert.equal(goal.response.status, 201)

  const contribution = await request(`/api/goals/${goal.body.goal.id}/contributions`, {
    ...json('POST', { amount: 10000 }),
    cookie: firstCookie,
  })
  assert.equal(contribution.body.goal.savedAmount, 10000)

  const firstDashboard = await request('/api/dashboard', { cookie: firstCookie })
  assert.equal(firstDashboard.body.summary.income, 80000)
  assert.equal(firstDashboard.body.summary.expenses, 2500)
  assert.equal(firstDashboard.body.summary.balance, 77500)
  assert.equal(firstDashboard.body.budgets[0].spent, 2500)
  assert.equal(firstDashboard.body.goals[0].savedAmount, 10000)

  const secondSignup = await request('/api/auth/register', json('POST', {
    name: 'Other User',
    email: 'other@example.com',
    password: 'a-different-password-456',
  }))
  assert.equal(secondSignup.response.status, 201)

  const secondDashboard = await request('/api/dashboard', { cookie: secondSignup.cookie })
  assert.equal(secondDashboard.body.summary.income, 0)
  assert.equal(secondDashboard.body.summary.expenses, 0)
  assert.deepEqual(secondDashboard.body.budgets, [])
  assert.deepEqual(secondDashboard.body.goals, [])
  const secondTransactions = await request('/api/transactions', { cookie: secondSignup.cookie })
  assert.deepEqual(secondTransactions.body.transactions, [])

  const logout = await request('/api/auth/logout', { method: 'POST', cookie: firstCookie })
  assert.equal(logout.response.status, 204)
  const loggedOut = await request('/api/auth/me', { cookie: firstCookie })
  assert.equal(loggedOut.response.status, 401)
})

test('rejects invalid financial inputs', async () => {
  const signup = await request('/api/auth/register', json('POST', {
    name: 'Validation User',
    email: 'validation@example.com',
    password: 'a-valid-password-789',
  }))

  const invalidTransaction = await request('/api/transactions', {
    ...json('POST', {
      name: 'Invalid amount',
      category: 'Food',
      type: 'expense',
      amount: -1,
      date: new Date().toISOString().slice(0, 10),
    }),
    cookie: signup.cookie,
  })
  assert.equal(invalidTransaction.response.status, 400)

  const futureTransaction = await request('/api/transactions', {
    ...json('POST', {
      name: 'Future expense',
      category: 'Food',
      type: 'expense',
      amount: 100,
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    }),
    cookie: signup.cookie,
  })
  assert.equal(futureTransaction.response.status, 400)

  const invalidLogin = await request('/api/auth/login', json('POST', {
    email: 'validation@example.com',
    password: 'a-wrong-password-456',
  }))
  assert.equal(invalidLogin.response.status, 401)

  const overfundedGoal = await request('/api/goals', {
    ...json('POST', { name: 'Small goal', targetAmount: 100 }),
    cookie: signup.cookie,
  })
  const invalidContribution = await request(`/api/goals/${overfundedGoal.body.goal.id}/contributions`, {
    ...json('POST', { amount: 101 }),
    cookie: signup.cookie,
  })
  assert.equal(invalidContribution.response.status, 400)
})
