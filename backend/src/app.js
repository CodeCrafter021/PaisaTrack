import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SESSION_COOKIE = 'paisatrack_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const API_DIRECTORY = fileURLToPath(new URL('.', import.meta.url))
const FRONTEND_DIST = resolve(API_DIRECTORY, '../../frontend/dist')
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 12)

const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const nowIso = () => new Date().toISOString()
const localDate = (date) => date.toISOString().slice(0, 10)

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  }
}

function sendError(response, status, message) {
  response.status(status).json({ error: message })
}

function isUniqueConstraint(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.errcode === 2067
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function periodStart(period, now) {
  if (period === 'last30days') {
    const start = new Date(now)
    start.setUTCDate(start.getUTCDate() - 29)
    return localDate(start)
  }
  if (period === 'thisyear') {
    return `${now.getUTCFullYear()}-01-01`
  }
  return `${localDate(now).slice(0, 7)}-01`
}

function monthSequence(now) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    return {
      month: key,
      label: date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
      income: 0,
      expenses: 0,
    }
  })
}

function requireUser(db, cookieSecure) {
  return (request, response, next) => {
    const token = request.cookies?.[SESSION_COOKIE]
    if (!token) return sendError(response, 401, 'Please sign in to continue.')

    const session = db.prepare(`
      SELECT users.id, users.name, users.email, users.created_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), nowIso())

    if (!session) {
      response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' })
      return sendError(response, 401, 'Please sign in to continue.')
    }

    request.user = session
    return next()
  }
}

function createSession(db, response, userId, cookieSecure) {
  const token = randomBytes(32).toString('base64url')
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString()

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), userId, expiresAt, createdAt)

  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    path: '/',
    maxAge: SESSION_DURATION_MS,
  })
}

function getDashboard(db, userId, period) {
  const now = new Date()
  const start = periodStart(period, now)
  const today = localDate(now)
  const currentMonthStart = `${today.slice(0, 7)}-01`
  const aggregates = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' AND occurred_on BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' AND occurred_on BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS expenses,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END), 0) AS balance
    FROM transactions
    WHERE user_id = ?
  `).get(start, today, start, today, userId)

  const categories = db.prepare(`
    SELECT category AS name, SUM(amount) AS amount
    FROM transactions
    WHERE user_id = ? AND type = 'expense' AND occurred_on BETWEEN ? AND ?
    GROUP BY category
    ORDER BY amount DESC
  `).all(userId, start, today)

  const monthRows = db.prepare(`
    SELECT
      strftime('%Y-%m', occurred_on) AS month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expenses
    FROM transactions
    WHERE user_id = ? AND occurred_on >= ?
    GROUP BY strftime('%Y-%m', occurred_on)
  `).all(userId, monthSequence(now)[0].month + '-01')
  const monthValues = new Map(monthRows.map((row) => [row.month, row]))
  const monthlyFlow = monthSequence(now).map((month) => ({
    ...month,
    income: monthValues.get(month.month)?.income ?? 0,
    expenses: monthValues.get(month.month)?.expenses ?? 0,
  }))

  const budgets = db.prepare(`
    SELECT
      budgets.id,
      budgets.name,
      budgets.monthly_limit AS monthlyLimit,
      COALESCE(SUM(transactions.amount), 0) AS spent
    FROM budgets
    LEFT JOIN transactions
      ON transactions.user_id = budgets.user_id
      AND transactions.category = budgets.name
      AND transactions.type = 'expense'
      AND transactions.occurred_on BETWEEN ? AND ?
    WHERE budgets.user_id = ?
    GROUP BY budgets.id
    ORDER BY budgets.name COLLATE NOCASE
  `).all(currentMonthStart, today, userId)

  const goals = db.prepare(`
    SELECT id, name, target_amount AS targetAmount, saved_amount AS savedAmount
    FROM goals
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(userId)

  const recentTransactions = db.prepare(`
    SELECT id, name, category, type, amount, occurred_on AS date
    FROM transactions
    WHERE user_id = ?
    ORDER BY occurred_on DESC, id DESC
    LIMIT 8
  `).all(userId)

  const daysInPeriod = period === 'last30days'
    ? 30
    : period === 'thisyear'
      ? Math.max(1, Math.floor((now - new Date(Date.UTC(now.getUTCFullYear(), 0, 1))) / 86400000) + 1)
      : now.getUTCDate()

  return {
    summary: {
      income: aggregates.income,
      expenses: aggregates.expenses,
      balance: aggregates.balance,
      savingsRate: aggregates.income > 0
        ? Math.round(((aggregates.income - aggregates.expenses) / aggregates.income) * 1000) / 10
        : 0,
      daysInPeriod,
    },
    spending: categories.map((item) => ({
      ...item,
      share: aggregates.expenses > 0 ? Math.round((item.amount / aggregates.expenses) * 1000) / 10 : 0,
    })),
    monthlyFlow,
    budgets,
    goals,
    recentTransactions,
  }
}

export function createApp({ db, cookieSecure = process.env.NODE_ENV === 'production', serveFrontend = false } = {}) {
  if (!db) throw new TypeError('createApp requires a database instance.')

  const app = express()
  const requireAuth = requireUser(db, cookieSecure)
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => sendError(response, 429, 'Too many sign-in attempts. Try again later.'),
  })

  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: cookieSecure,
    strictTransportSecurity: cookieSecure,
  }))
  app.use(express.json({ limit: '16kb' }))
  app.use(cookieParser())
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

  app.post('/api/auth/register', authRateLimit, async (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''

    if (!name || name.length > 80) return sendError(response, 400, 'Enter a name between 1 and 80 characters.')
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return sendError(response, 400, 'Enter a valid email address.')
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      return sendError(response, 400, 'Password must be at least 12 characters and no more than 72 bytes.')
    }

    const passwordHash = await bcrypt.hash(password, 12)
    try {
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
      `).run(name, email, passwordHash, nowIso())
      const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(result.lastInsertRowid)
      createSession(db, response, user.id, cookieSecure)
      return response.status(201).json({ user: publicUser(user) })
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return sendError(response, 409, 'An account with this email already exists.')
      }
      throw error
    }
  })

  app.post('/api/auth/login', authRateLimit, async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH)

    if (!user || !passwordMatches || Buffer.byteLength(password, 'utf8') > 72) {
      return sendError(response, 401, 'Email or password is incorrect.')
    }

    createSession(db, response, user.id, cookieSecure)
    return response.json({ user: publicUser(user) })
  })

  app.post('/api/auth/logout', (request, response) => {
    const token = request.cookies?.[SESSION_COOKIE]
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' })
    return response.status(204).end()
  })

  app.get('/api/auth/me', requireAuth, (request, response) => {
    response.json({ user: publicUser(request.user) })
  })

  app.get('/api/dashboard', requireAuth, (request, response) => {
    const period = ['thismonth', 'last30days', 'thisyear'].includes(request.query.period)
      ? request.query.period
      : 'thismonth'
    response.json(getDashboard(db, request.user.id, period))
  })

  app.get('/api/transactions', requireAuth, (request, response) => {
    const transactions = db.prepare(`
      SELECT id, name, category, type, amount, occurred_on AS date
      FROM transactions
      WHERE user_id = ?
      ORDER BY occurred_on DESC, id DESC
      LIMIT 500
    `).all(request.user.id)
    response.json({ transactions })
  })

  app.post('/api/transactions', requireAuth, (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    const category = typeof request.body?.category === 'string' ? request.body.category.trim() : ''
    const { type, amount, date } = request.body ?? {}

    if (!name || name.length > 100) return sendError(response, 400, 'Description must be between 1 and 100 characters.')
    if (!category || category.length > 50) return sendError(response, 400, 'Category must be between 1 and 50 characters.')
    if (!['income', 'expense'].includes(type)) return sendError(response, 400, 'Choose income or expense.')
    if (!Number.isSafeInteger(amount) || amount <= 0) return sendError(response, 400, 'Amount must be a positive whole number of rupees.')
    if (!validDate(date) || date > localDate(new Date())) {
      return sendError(response, 400, 'Enter a valid date that is not in the future.')
    }

    const result = db.prepare(`
      INSERT INTO transactions (user_id, name, category, type, amount, occurred_on, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(request.user.id, name, category, type, amount, date, nowIso())

    const transaction = db.prepare(`
      SELECT id, name, category, type, amount, occurred_on AS date
      FROM transactions WHERE id = ? AND user_id = ?
    `).get(result.lastInsertRowid, request.user.id)
    return response.status(201).json({ transaction })
  })

  app.delete('/api/transactions/:id', requireAuth, (request, response) => {
    const id = Number(request.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return sendError(response, 400, 'Invalid transaction id.')
    const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, request.user.id)
    if (!result.changes) return sendError(response, 404, 'Transaction not found.')
    return response.status(204).end()
  })

  app.get('/api/budgets', requireAuth, (request, response) => {
    response.json({
      budgets: db.prepare(`
        SELECT id, name, monthly_limit AS monthlyLimit, created_at AS createdAt
        FROM budgets WHERE user_id = ? ORDER BY name COLLATE NOCASE
      `).all(request.user.id),
    })
  })

  app.post('/api/budgets', requireAuth, (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    const monthlyLimit = request.body?.monthlyLimit
    if (!name || name.length > 50) return sendError(response, 400, 'Budget name must be between 1 and 50 characters.')
    if (!Number.isSafeInteger(monthlyLimit) || monthlyLimit <= 0) {
      return sendError(response, 400, 'Monthly limit must be a positive whole number of rupees.')
    }

    try {
      const result = db.prepare(`
        INSERT INTO budgets (user_id, name, monthly_limit, created_at) VALUES (?, ?, ?, ?)
      `).run(request.user.id, name, monthlyLimit, nowIso())
      return response.status(201).json({
        budget: db.prepare(`
          SELECT id, name, monthly_limit AS monthlyLimit, created_at AS createdAt
          FROM budgets WHERE id = ? AND user_id = ?
        `).get(result.lastInsertRowid, request.user.id),
      })
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return sendError(response, 409, 'A budget already exists for this category.')
      }
      throw error
    }
  })

  app.delete('/api/budgets/:id', requireAuth, (request, response) => {
    const id = Number(request.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return sendError(response, 400, 'Invalid budget id.')
    const result = db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, request.user.id)
    if (!result.changes) return sendError(response, 404, 'Budget not found.')
    return response.status(204).end()
  })

  app.get('/api/goals', requireAuth, (request, response) => {
    response.json({
      goals: db.prepare(`
        SELECT id, name, target_amount AS targetAmount, saved_amount AS savedAmount, created_at AS createdAt
        FROM goals WHERE user_id = ? ORDER BY created_at DESC, id DESC
      `).all(request.user.id),
    })
  })

  app.post('/api/goals', requireAuth, (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    const targetAmount = request.body?.targetAmount
    if (!name || name.length > 60) return sendError(response, 400, 'Goal name must be between 1 and 60 characters.')
    if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
      return sendError(response, 400, 'Target amount must be a positive whole number of rupees.')
    }

    const result = db.prepare(`
      INSERT INTO goals (user_id, name, target_amount, created_at) VALUES (?, ?, ?, ?)
    `).run(request.user.id, name, targetAmount, nowIso())
    return response.status(201).json({
      goal: db.prepare(`
        SELECT id, name, target_amount AS targetAmount, saved_amount AS savedAmount, created_at AS createdAt
        FROM goals WHERE id = ? AND user_id = ?
      `).get(result.lastInsertRowid, request.user.id),
    })
  })

  app.post('/api/goals/:id/contributions', requireAuth, (request, response) => {
    const id = Number(request.params.id)
    const amount = request.body?.amount
    if (!Number.isSafeInteger(id) || id < 1) return sendError(response, 400, 'Invalid goal id.')
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return sendError(response, 400, 'Contribution must be a positive whole number of rupees.')
    }

    const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(id, request.user.id)
    if (!goal) return sendError(response, 404, 'Savings goal not found.')
    if (goal.saved_amount + amount > goal.target_amount) {
      return sendError(response, 400, 'Contribution exceeds the remaining amount for this goal.')
    }
    db.prepare('UPDATE goals SET saved_amount = saved_amount + ? WHERE id = ? AND user_id = ?')
      .run(amount, id, request.user.id)
    return response.json({
      goal: db.prepare(`
        SELECT id, name, target_amount AS targetAmount, saved_amount AS savedAmount, created_at AS createdAt
        FROM goals WHERE id = ? AND user_id = ?
      `).get(id, request.user.id),
    })
  })

  app.delete('/api/goals/:id', requireAuth, (request, response) => {
    const id = Number(request.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return sendError(response, 400, 'Invalid goal id.')
    const result = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, request.user.id)
    if (!result.changes) return sendError(response, 404, 'Savings goal not found.')
    return response.status(204).end()
  })

  app.use('/api', (_request, response) => sendError(response, 404, 'API route not found.'))

  if (serveFrontend) {
    app.use(express.static(FRONTEND_DIST, { index: false }))
    app.get('*splat', (request, response, next) => {
      if (request.path.startsWith('/api/')) return next()
      return response.sendFile(resolve(FRONTEND_DIST, 'index.html'), (error) => {
        if (error) next(error)
      })
    })
  }

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') return sendError(response, 400, 'Request body must be valid JSON.')
    if (error.type === 'entity.too.large') return sendError(response, 413, 'Request body is too large.')
    if (process.env.NODE_ENV !== 'test') console.error(error)
    return sendError(response, 500, 'Something went wrong. Please try again.')
  })

  return app
}
