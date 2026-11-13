import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { api } from './api'
import './App.css'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Transactions', icon: ArrowLeftRight },
  { label: 'Budgets', icon: Wallet },
  { label: 'Goals', icon: Target },
  { label: 'Reports', icon: ChartNoAxesCombined },
]

const periods = [
  { value: 'thismonth', label: 'This month' },
  { value: 'last30days', label: 'Last 30 days' },
  { value: 'thisyear', label: 'This year' },
]

const expenseCategories = ['Food', 'Housing', 'Transport', 'Shopping', 'Bills', 'Health', 'Education', 'Subscriptions', 'Other']
const incomeCategories = ['Salary', 'Freelance', 'Business', 'Investment', 'Other']

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatCurrency(value = 0) {
  return currency.format(value)
}

function formatChartCurrency(value = 0) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  return formatCurrency(value)
}

function formatDate(value) {
  if (!value) return ''
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function fetchAccountData(period) {
  return Promise.all([
    api(`/dashboard?period=${period}`),
    api('/transactions'),
  ])
}

function App() {
  const [authState, setAuthState] = useState('checking')
  const [authError, setAuthError] = useState('')
  const [user, setUser] = useState(null)
  const [section, setSection] = useState('Overview')
  const [period, setPeriod] = useState('thismonth')
  const [dashboard, setDashboard] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [pageError, setPageError] = useState('')
  const [modal, setModal] = useState('')
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [actionError, setActionError] = useState('')

  const checkSession = useCallback(async () => {
    try {
      const { user: activeUser } = await api('/auth/me')
      setDashboard(null)
      setTransactions([])
      setUser(activeUser)
      setAuthState('signed-in')
    } catch (error) {
      if (error.status === 401) {
        setDashboard(null)
        setTransactions([])
        setUser(null)
        setAuthState('signed-out')
      } else {
        setAuthError(error.message)
        setAuthState('unavailable')
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    api('/auth/me')
      .then(({ user: activeUser }) => {
        if (!active) return
        setUser(activeUser)
        setAuthState('signed-in')
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          setAuthState('signed-out')
        } else {
          setAuthError(error.message)
          setAuthState('unavailable')
        }
      })
    return () => { active = false }
  }, [])

  const refreshData = useCallback(async () => {
    if (!user) return
    try {
      const [dashboardData, transactionData] = await fetchAccountData(period)
      setDashboard(dashboardData)
      setTransactions(transactionData.transactions)
      setPageError('')
    } catch (error) {
      if (error.status === 401) {
        setDashboard(null)
        setTransactions([])
        setUser(null)
        setAuthState('signed-out')
      } else {
        setPageError(error.message)
      }
      throw error
    }
  }, [period, user])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    fetchAccountData(period)
      .then(([dashboardData, transactionData]) => {
        if (!active) return
        setDashboard(dashboardData)
        setTransactions(transactionData.transactions)
        setPageError('')
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          setDashboard(null)
          setTransactions([])
          setUser(null)
          setAuthState('signed-out')
        } else {
          setPageError(error.message)
        }
      })
    return () => { active = false }
  }, [period, user])

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return transactions
    return transactions.filter((transaction) =>
      `${transaction.name} ${transaction.category} ${transaction.type}`.toLowerCase().includes(query),
    )
  }, [search, transactions])

  const budgetAlerts = useMemo(
    () => (dashboard?.budgets ?? []).filter((budget) => budget.monthlyLimit > 0 && budget.spent >= budget.monthlyLimit * 0.8),
    [dashboard],
  )

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  async function handleAuth(mode, values) {
    const endpoint = mode === 'signup' ? '/auth/register' : '/auth/login'
    const result = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(values),
    })
    setDashboard(null)
    setTransactions([])
    setUser(result.user)
    setAuthError('')
    setAuthState('signed-in')
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' })
      setDashboard(null)
      setTransactions([])
      setUser(null)
      setDashboard(null)
      setTransactions([])
      setAuthState('signed-out')
      setSection('Overview')
      setSearch('')
    } catch (error) {
      showNotice(error.message)
    }
  }

  async function addTransaction(values) {
    setActionError('')
    try {
      await api('/transactions', { method: 'POST', body: JSON.stringify(values) })
      setModal('')
      showNotice('Transaction saved to your account.')
      await refreshData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function deleteTransaction(transaction) {
    if (!window.confirm(`Delete “${transaction.name}”? This cannot be undone.`)) return
    try {
      await api(`/transactions/${transaction.id}`, { method: 'DELETE' })
      showNotice('Transaction deleted.')
      await refreshData()
    } catch (error) {
      setPageError(error.message)
    }
  }

  async function createBudget(values) {
    setActionError('')
    try {
      await api('/budgets', { method: 'POST', body: JSON.stringify(values) })
      setModal('')
      showNotice('Budget saved to your account.')
      await refreshData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function createGoal(values) {
    setActionError('')
    try {
      await api('/goals', { method: 'POST', body: JSON.stringify(values) })
      setModal('')
      showNotice('Savings goal saved to your account.')
      await refreshData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function contributeToGoal(amount) {
    if (!selectedGoal) return
    setActionError('')
    try {
      await api(`/goals/${selectedGoal.id}/contributions`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      })
      setModal('')
      setSelectedGoal(null)
      showNotice('Savings progress updated.')
      await refreshData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  function exportTransactions() {
    const rows = [
      ['Description', 'Category', 'Date', 'Type', 'Amount (INR)'],
      ...filteredTransactions.map(({ name, category, date, type, amount }) => [name, category, date, type, amount]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'paisatrack-transactions.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    showNotice('Your transaction export is ready.')
  }

  if (authState === 'checking') {
    return <LoadingScreen message="Checking your account…" />
  }

  if (authState === 'signed-out' || authState === 'unavailable') {
    return (
      <AuthScreen
        connectionError={authState === 'unavailable' ? authError : ''}
        onRetry={() => {
          setAuthError('')
          setAuthState('checking')
          checkSession()
        }}
        onSubmit={handleAuth}
      />
    )
  }

  const summary = dashboard?.summary
  const pageTitle = section === 'Overview' ? 'Overview' : section
  const selectedPeriod = periods.find((item) => item.value === period)?.label ?? 'This month'

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}>
        <button className="brand" onClick={() => { setSection('Overview'); setSearch('') }}>
          <span className="brand-mark"><Wallet size={19} strokeWidth={1.75} /></span>
          <span className="brand-name">paisa<span>track</span></span>
        </button>

        <div className="workspace-label">YOUR MONEY</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-link ${section === label ? 'nav-link--active' : ''}`}
              key={label}
              onClick={() => {
                setSection(label)
                setMobileNavOpen(false)
              }}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
              {label === 'Transactions' && <span className="nav-count">{transactions.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <div className="sidebar-divider" />
          <div className="profile-button">
            <span className="avatar">{initials(user.name)}</span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <button className="nav-link signout-link" onClick={signOut}>
            <LogOut size={18} strokeWidth={1.75} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="icon-button mobile-menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={19} />
          </button>
          <label className="search-box">
            <Search size={17} strokeWidth={1.75} />
            <input
              aria-label="Search transactions"
              onChange={(event) => {
                setSearch(event.target.value)
                if (event.target.value) setSection('Transactions')
              }}
              placeholder="Search your activity..."
              value={search}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <button
              aria-label="Budget alerts"
              aria-expanded={notificationsOpen}
              className={`icon-button ${notificationsOpen ? 'icon-button--selected' : ''}`}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={18} strokeWidth={1.75} />
              {budgetAlerts.length > 0 && <span className="notification-dot" />}
            </button>
            <span className="topbar-divider" />
            <button className="top-avatar" aria-label="Sign out" onClick={signOut}>{initials(user.name)}</button>
          </div>
          {notificationsOpen && (
            <div className="notification-popover">
              <div className="popover-heading">
                <strong>Budget alerts</strong>
                <button aria-label="Close alerts" className="plain-icon" onClick={() => setNotificationsOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              {budgetAlerts.length > 0 ? budgetAlerts.map((budget) => (
                <div className="notification-item" key={budget.id}>
                  <span className="notification-icon"><Bell size={16} /></span>
                  <span>
                    <strong>{budget.name}</strong>
                    <small>{formatCurrency(budget.spent)} of {formatCurrency(budget.monthlyLimit)} used</small>
                  </span>
                </div>
              )) : (
                <p className="notification-empty">No budget alerts. Alerts appear here when a category reaches 80% of its limit.</p>
              )}
            </div>
          )}
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</p>
              <h1>{pageTitle}</h1>
              <p className="page-subtitle">
                {section === 'Overview' ? `Welcome back, ${user.name.split(/\s+/)[0]}. Here’s your recorded activity.` : `Your ${section.toLowerCase()}, kept in one place.`}
              </p>
            </div>
            <div className="heading-actions">
              <label className="period-select">
                <CalendarDays size={16} />
                <select aria-label="Select date range" value={period} onChange={(event) => setPeriod(event.target.value)}>
                  {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <ChevronDown size={15} />
              </label>
              <button className="button button--primary" onClick={() => { setActionError(''); setModal('transaction') }}>
                <Plus size={17} strokeWidth={2} />
                <span>Add transaction</span>
              </button>
            </div>
          </section>

          {pageError && (
            <div className="inline-error" role="alert">
              <span>{pageError}</span>
              <button className="button button--quiet" onClick={() => refreshData().catch(() => {})}>Try again</button>
            </div>
          )}

          {!dashboard && !pageError ? (
            <LoadingScreen message="Loading your financial activity…" compact />
          ) : section === 'Budgets' ? (
            <BudgetPage
              budgets={dashboard?.budgets ?? []}
              onAdd={() => { setActionError(''); setModal('budget') }}
              actionError={actionError}
            />
          ) : section === 'Goals' ? (
            <GoalsPage
              goals={dashboard?.goals ?? []}
              onAdd={() => { setActionError(''); setModal('goal') }}
              onContribute={(goal) => { setSelectedGoal(goal); setActionError(''); setModal('contribution') }}
              actionError={actionError}
            />
          ) : section === 'Reports' ? (
            <ReportsPage dashboard={dashboard} period={selectedPeriod} />
          ) : section === 'Transactions' ? (
            <section className="full-column">
              <TransactionsCard
                onDelete={deleteTransaction}
                onExport={exportTransactions}
                transactions={filteredTransactions}
                expanded
              />
            </section>
          ) : (
            <>
              <section className="stats-grid" aria-label="Financial summary">
                <MetricCard label="Net balance" value={formatCurrency(summary?.balance)} caption="All recorded income and expenses" icon={Wallet} />
                <MetricCard label="Income" value={formatCurrency(summary?.income)} caption={selectedPeriod} icon={TrendingUp} />
                <MetricCard label="Expenses" value={formatCurrency(summary?.expenses)} caption={selectedPeriod} icon={TrendingDown} />
                <MetricCard label="Savings rate" value={`${summary?.savingsRate ?? 0}%`} caption="For selected period" icon={Target} />
              </section>

              <section className="dashboard-grid">
                <div className="left-column">
                  <CashFlowCard
                    period={selectedPeriod}
                    income={summary?.income ?? 0}
                    expenses={summary?.expenses ?? 0}
                    monthlyFlow={dashboard?.monthlyFlow ?? []}
                    onAdd={() => { setActionError(''); setModal('transaction') }}
                  />
                  <TransactionsCard
                    onDelete={deleteTransaction}
                    onExport={exportTransactions}
                    onViewAll={() => setSection('Transactions')}
                    transactions={(dashboard?.recentTransactions ?? []).slice(0, 5)}
                  />
                </div>
                <div className="right-column">
                  <SpendingCard
                    categories={dashboard?.spending ?? []}
                    total={summary?.expenses ?? 0}
                    period={selectedPeriod}
                    onAdd={() => { setActionError(''); setModal('transaction') }}
                  />
                  <BudgetCard
                    budgets={dashboard?.budgets ?? []}
                    onManage={() => setSection('Budgets')}
                    onAdd={() => { setActionError(''); setModal('budget') }}
                  />
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} PaisaTrack</span>
            <span>Your data is private to your account.</span>
          </footer>
        </div>
      </main>

      {notice && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={15} /></span>
          {notice}
        </div>
      )}
      {modal === 'transaction' && (
        <TransactionModal
          error={actionError}
          onClose={() => setModal('')}
          onSubmit={addTransaction}
        />
      )}
      {modal === 'budget' && (
        <BudgetModal
          error={actionError}
          onClose={() => setModal('')}
          onSubmit={createBudget}
        />
      )}
      {modal === 'goal' && (
        <GoalModal
          error={actionError}
          onClose={() => setModal('')}
          onSubmit={createGoal}
        />
      )}
      {modal === 'contribution' && selectedGoal && (
        <ContributionModal
          error={actionError}
          goal={selectedGoal}
          onClose={() => { setModal(''); setSelectedGoal(null) }}
          onSubmit={contributeToGoal}
        />
      )}
    </div>
  )
}

function AuthScreen({ connectionError, onRetry, onSubmit }) {
  const [mode, setMode] = useState('login')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const isSignup = mode === 'signup'

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    const formData = new FormData(event.currentTarget)
    try {
      await onSubmit(mode, {
        name: String(formData.get('name') ?? '').trim(),
        email: String(formData.get('email')).trim(),
        password: String(formData.get('password')),
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark"><Wallet size={19} strokeWidth={1.75} /></span>
          <span className="brand-name">paisa<span>track</span></span>
        </div>
        <p className="eyebrow">PERSONAL FINANCE, MADE CLEAR</p>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-subtitle">
          {isSignup ? 'Your own private space to track income, spending, budgets and savings.' : 'Sign in to see the financial activity you’ve recorded.'}
        </p>

        {connectionError && (
          <div className="inline-error auth-connection-error" role="alert">
            <span>Can’t reach the PaisaTrack server. Start the backend, then try again.</span>
            <button className="button button--quiet" onClick={onRetry} type="button">Retry</button>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}

        <form className="auth-form" onSubmit={submit}>
          {isSignup && (
            <label className="form-field">
              <span>Your name</span>
              <input autoComplete="name" maxLength="80" name="name" placeholder="How should we address you?" required />
            </label>
          )}
          <label className="form-field">
            <span>Email address</span>
            <input autoComplete="email" name="email" placeholder="you@example.com" required type="email" />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 12 : undefined} name="password" placeholder={isSignup ? 'At least 12 characters' : 'Enter your password'} required type="password" />
            {isSignup && <small className="field-hint">Use at least 12 characters.</small>}
          </label>
          <button className="button button--primary auth-submit" disabled={pending} type="submit">
            {pending ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New to PaisaTrack?'}
          <button
            onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError('') }}
            type="button"
          >
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="auth-privacy">Your account is separate from other users. PaisaTrack does not connect to your bank.</p>
      </section>
    </main>
  )
}

function LoadingScreen({ message, compact = false }) {
  return (
    <main className={`loading-screen ${compact ? 'loading-screen--compact' : ''}`} role="status">
      <span className="brand-mark"><Wallet size={19} strokeWidth={1.75} /></span>
      <p>{message}</p>
    </main>
  )
}

function MetricCard({ label, value, caption, icon: Icon }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon"><Icon size={17} strokeWidth={1.75} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">{caption}</div>
    </article>
  )
}

function CashFlowCard({ period, income, expenses, monthlyFlow, onAdd }) {
  const maxValue = Math.max(0, ...monthlyFlow.flatMap((month) => [month.income, month.expenses]))
  const hasData = maxValue > 0

  return (
    <article className="surface cashflow-card">
      <div className="surface-heading">
        <div><h2>Cash flow</h2><p>Your recorded income and expenses by month</p></div>
      </div>
      <div className="cashflow-legend">
        <span><i className="legend-dot legend-dot--income" /> Income</span>
        <span><i className="legend-dot legend-dot--expense" /> Expenses</span>
        <strong>{period}</strong>
      </div>
      {hasData ? (
        <div className="chart-area" aria-label="Monthly income and expense comparison">
          <div className="chart-y-labels"><span>{formatChartCurrency(maxValue)}</span><span>{formatChartCurrency(maxValue * 0.66)}</span><span>{formatChartCurrency(maxValue * 0.33)}</span><span>₹0</span></div>
          <div className="chart">
            <div className="chart-gridline chart-gridline--one" />
            <div className="chart-gridline chart-gridline--two" />
            <div className="chart-gridline chart-gridline--three" />
            <div className="chart-gridline chart-gridline--four" />
            {monthlyFlow.map((month) => (
              <div className={`bar-group ${month.month === new Date().toISOString().slice(0, 7) ? 'bar-group--current' : ''}`} key={month.month}>
                <div className="bar-pair">
                  <span className="bar bar--income" style={{ height: `${maxValue ? month.income / maxValue * 100 : 0}%` }} />
                  <span className="bar bar--expense" style={{ height: `${maxValue ? month.expenses / maxValue * 100 : 0}%` }} />
                </div>
                <span className="bar-label">{month.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyWidget
          message="No transactions recorded for this chart yet."
          onAdd={onAdd}
          action="Add a transaction"
        />
      )}
      <div className="chart-summary">
        <div><span>Income</span><strong>{formatCurrency(income)}</strong></div>
        <div><span>Expenses</span><strong>{formatCurrency(expenses)}</strong></div>
        <div><span>Net for period</span><strong>{formatCurrency(income - expenses)}</strong></div>
      </div>
    </article>
  )
}

function TransactionsCard({ transactions, onExport, onViewAll, onDelete, expanded = false }) {
  return (
    <article className={`surface transactions-card ${expanded ? 'transactions-card--expanded' : ''}`}>
      <div className="surface-heading">
        <div>
          <h2>{expanded ? 'Your transactions' : 'Recent transactions'}</h2>
          <p>{expanded ? 'Only entries saved to your account appear here.' : 'Most recently recorded activity'}</p>
        </div>
        {expanded && transactions.length > 0 && (
          <button className="button button--quiet" onClick={onExport}><Download size={16} /> Export</button>
        )}
      </div>
      <div className="transaction-table">
        <div className="transaction-row transaction-row--header">
          <span>TRANSACTION</span><span>CATEGORY</span><span>DATE</span><span className="amount-heading">AMOUNT</span>{expanded && <span />}
        </div>
        {transactions.length > 0 ? transactions.map((transaction) => {
          const Icon = transaction.type === 'income' ? ArrowDownLeft : CreditCard
          return (
            <div className="transaction-row" key={transaction.id}>
              <div className="transaction-name">
                <span className={`transaction-icon transaction-icon--${transaction.type}`}><Icon size={17} strokeWidth={1.75} /></span>
                <span><strong>{transaction.name}</strong><small>{transaction.type === 'income' ? 'Income' : 'Expense'}</small></span>
              </div>
              <span className="category-cell">{transaction.category}</span>
              <span className="date-cell">{formatDate(transaction.date)}</span>
              <strong className={`transaction-amount transaction-amount--${transaction.type}`}>
                {transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
              </strong>
              {expanded && (
                <button className="plain-icon delete-transaction" aria-label={`Delete ${transaction.name}`} onClick={() => onDelete(transaction)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )
        }) : (
          <EmptyWidget
            message="Your saved transactions will appear here."
            onAdd={onViewAll}
            action={expanded ? 'Add your first transaction' : undefined}
          />
        )}
      </div>
      {!expanded && transactions.length > 0 && (
        <button className="view-all-button" onClick={onViewAll}>
          View all transactions <ArrowUpRight size={15} />
        </button>
      )}
    </article>
  )
}

function SpendingCard({ categories, total, period, onAdd }) {
  return (
    <article className="surface spending-card">
      <div className="surface-heading">
        <div><h2>Spending breakdown</h2><p>Based on your saved expenses</p></div>
      </div>
      <div className="spending-total"><strong>{formatCurrency(total)}</strong><span>{period.toLowerCase()}</span></div>
      {categories.length > 0 ? (
        <div className="spending-list">
          {categories.map((category, index) => (
            <div className="spending-item" key={category.name}>
              <div className="spending-item-head"><span>{category.name}</span><strong>{formatCurrency(category.amount)}</strong></div>
              <div className="spending-track"><span className={`spend-bar--${(index % 4) + 1}`} style={{ width: `${category.share}%` }} /></div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyWidget message="Add an expense to see which categories you spend on." onAdd={onAdd} action="Add an expense" />
      )}
    </article>
  )
}

function BudgetCard({ budgets, onManage, onAdd }) {
  return (
    <article className="surface budget-card">
      <div className="surface-heading">
        <div><h2>Monthly budgets</h2><p>Progress from this month’s saved expenses</p></div>
      </div>
      {budgets.length > 0 ? (
        <div className="budget-list">
          {budgets.slice(0, 3).map((budget) => {
            const percentage = Math.min(100, Math.round((budget.spent / budget.monthlyLimit) * 100))
            return (
              <div className="budget-item" key={budget.id}>
                <div className="budget-item-head">
                  <strong>{budget.name}</strong>
                  <span>{formatCurrency(budget.spent)} <small>of {formatCurrency(budget.monthlyLimit)}</small></span>
                </div>
                <div className="budget-track"><span style={{ width: `${percentage}%` }} /></div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyWidget message="Create a category budget to track your spending limit." onAdd={onAdd} action="Create a budget" />
      )}
      {budgets.length > 0 && (
        <button className="view-all-button" onClick={onManage}>Manage budgets <ArrowUpRight size={15} /></button>
      )}
    </article>
  )
}

function BudgetPage({ budgets, onAdd, actionError }) {
  return (
    <section className="surface page-list">
      <div className="surface-heading">
        <div><h2>Your budgets</h2><p>Limits you set for your spending categories.</p></div>
        <button className="button button--quiet" onClick={onAdd}><Plus size={16} /> New budget</button>
      </div>
      {budgets.length > 0 ? (
        <div className="budget-list budget-list--page">
          {budgets.map((budget) => {
            const percentage = Math.min(100, Math.round((budget.spent / budget.monthlyLimit) * 100))
            return (
              <div className="budget-item" key={budget.id}>
                <div className="budget-item-head">
                  <strong>{budget.name}</strong>
                  <span>{formatCurrency(budget.spent)} <small>of {formatCurrency(budget.monthlyLimit)}</small></span>
                </div>
                <div className="budget-track"><span style={{ width: `${percentage}%` }} /></div>
                <small className="budget-caption">{formatCurrency(Math.max(0, budget.monthlyLimit - budget.spent))} remaining this month</small>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyWidget
          message="You haven’t created a budget yet. Set a monthly limit for a category you want to keep an eye on."
          onAdd={onAdd}
          action="Create your first budget"
        />
      )}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
    </section>
  )
}

function GoalsPage({ goals, onAdd, onContribute, actionError }) {
  return (
    <section className="surface page-list">
      <div className="surface-heading">
        <div><h2>Savings goals</h2><p>Goals and contributions saved to your account.</p></div>
        <button className="button button--quiet" onClick={onAdd}><Plus size={16} /> New goal</button>
      </div>
      {goals.length > 0 ? (
        <div className="goal-list">
          {goals.map((goal) => {
            const percentage = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
            return (
              <div className="goal-item" key={goal.id}>
                <span className="goal-icon"><Target size={19} /></span>
                <div className="goal-main">
                  <div className="budget-item-head">
                    <strong>{goal.name}</strong>
                    <span>{formatCurrency(goal.savedAmount)} <small>of {formatCurrency(goal.targetAmount)}</small></span>
                  </div>
                  <div className="budget-track"><span style={{ width: `${percentage}%` }} /></div>
                  <small className="budget-caption">{percentage}% of your target saved</small>
                </div>
                <button className="button button--quiet goal-contribute" disabled={goal.savedAmount >= goal.targetAmount} onClick={() => onContribute(goal)}>
                  Add savings
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyWidget
          message="You haven’t set a savings goal yet. Choose a target and add contributions as you go."
          onAdd={onAdd}
          action="Create your first goal"
        />
      )}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
    </section>
  )
}

function ReportsPage({ dashboard, period }) {
  const summary = dashboard?.summary
  const spending = dashboard?.spending ?? []
  const averageSpend = summary?.daysInPeriod ? summary.expenses / summary.daysInPeriod : 0

  return (
    <section className="report-layout">
      <CashFlowCard
        period={period}
        income={summary?.income ?? 0}
        expenses={summary?.expenses ?? 0}
        monthlyFlow={dashboard?.monthlyFlow ?? []}
      />
      <SpendingCard categories={spending} total={summary?.expenses ?? 0} period={period} />
      <article className="surface report-summary">
        <h2>Summary for {period.toLowerCase()}</h2>
        {summary?.income || summary?.expenses ? (
          <>
            <p>Your saved transactions show <strong>{formatCurrency(summary.income - summary.expenses)}</strong> net for this period.</p>
            <div className="report-stat"><span>Average daily expenses</span><strong>{formatCurrency(averageSpend)}</strong></div>
            <div className="report-stat"><span>Largest category</span><strong>{spending[0]?.name ?? '—'}</strong></div>
          </>
        ) : (
          <EmptyWidget message="Reports will appear after you record income or expenses." />
        )}
      </article>
    </section>
  )
}

function EmptyWidget({ message, onAdd, action }) {
  return (
    <div className="empty-widget">
      <p>{message}</p>
      {onAdd && action && <button className="button button--quiet" onClick={onAdd}><Plus size={15} /> {action}</button>}
    </div>
  )
}

function ModalFrame({ title, description, error, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="modal-title" aria-modal="true" className="transaction-modal" role="dialog">
        <div className="modal-heading">
          <div><h2 id="modal-title">{title}</h2><p>{description}</p></div>
          <button aria-label="Close dialog" className="plain-icon" onClick={onClose}><X size={19} /></button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {children}
      </section>
    </div>
  )
}

function TransactionModal({ error, onClose, onSubmit }) {
  const [type, setType] = useState('expense')

  async function submit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await onSubmit({
      name: String(formData.get('name')).trim(),
      category: String(formData.get('category')),
      type,
      amount: Number(formData.get('amount')),
      date: String(formData.get('date')),
    })
  }

  return (
    <ModalFrame title="Add transaction" description="Only you can see entries saved to your account." error={error} onClose={onClose}>
      <form className="transaction-form" onSubmit={submit}>
        <div className="type-switch" role="group" aria-label="Transaction type">
          <button className={type === 'expense' ? 'type-option type-option--active' : 'type-option'} onClick={() => setType('expense')} type="button"><ArrowUpRight size={16} /> Expense</button>
          <button className={type === 'income' ? 'type-option type-option--active' : 'type-option'} onClick={() => setType('income')} type="button"><ArrowDownLeft size={16} /> Income</button>
        </div>
        <label className="form-field"><span>Amount (INR)</span><div className="amount-input"><span>₹</span><input autoFocus min="1" name="amount" placeholder="0" required step="1" type="number" /></div></label>
        <label className="form-field"><span>Description</span><input autoComplete="off" maxLength="100" name="name" placeholder="e.g. Electricity bill" required /></label>
        <label className="form-field"><span>Category</span><select name="category">{(type === 'income' ? incomeCategories : expenseCategories).map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="form-field"><span>Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></label>
        <div className="modal-actions"><button className="button button--quiet" onClick={onClose} type="button">Cancel</button><button className="button button--primary" type="submit"><Plus size={16} /> Save transaction</button></div>
      </form>
    </ModalFrame>
  )
}

function BudgetModal({ error, onClose, onSubmit }) {
  async function submit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await onSubmit({ name: String(formData.get('name')), monthlyLimit: Number(formData.get('monthlyLimit')) })
  }

  return (
    <ModalFrame title="Create a budget" description="Set a monthly limit for an expense category." error={error} onClose={onClose}>
      <form className="transaction-form" onSubmit={submit}>
        <label className="form-field"><span>Category</span><select name="name">{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="form-field"><span>Monthly limit (INR)</span><div className="amount-input"><span>₹</span><input autoFocus min="1" name="monthlyLimit" placeholder="0" required step="1" type="number" /></div></label>
        <div className="modal-actions"><button className="button button--quiet" onClick={onClose} type="button">Cancel</button><button className="button button--primary" type="submit"><Plus size={16} /> Save budget</button></div>
      </form>
    </ModalFrame>
  )
}

function GoalModal({ error, onClose, onSubmit }) {
  async function submit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await onSubmit({ name: String(formData.get('name')).trim(), targetAmount: Number(formData.get('targetAmount')) })
  }

  return (
    <ModalFrame title="Create a savings goal" description="Set a target you want to save toward." error={error} onClose={onClose}>
      <form className="transaction-form" onSubmit={submit}>
        <label className="form-field"><span>Goal name</span><input autoFocus maxLength="60" name="name" placeholder="e.g. Emergency fund" required /></label>
        <label className="form-field"><span>Target amount (INR)</span><div className="amount-input"><span>₹</span><input min="1" name="targetAmount" placeholder="0" required step="1" type="number" /></div></label>
        <div className="modal-actions"><button className="button button--quiet" onClick={onClose} type="button">Cancel</button><button className="button button--primary" type="submit"><Plus size={16} /> Save goal</button></div>
      </form>
    </ModalFrame>
  )
}

function ContributionModal({ error, goal, onClose, onSubmit }) {
  async function submit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await onSubmit(Number(formData.get('amount')))
  }

  return (
    <ModalFrame title={`Add to ${goal.name}`} description={`${formatCurrency(Math.max(0, goal.targetAmount - goal.savedAmount))} left to reach this goal.`} error={error} onClose={onClose}>
      <form className="transaction-form" onSubmit={submit}>
        <label className="form-field"><span>Contribution (INR)</span><div className="amount-input"><span>₹</span><input autoFocus max={goal.targetAmount - goal.savedAmount} min="1" name="amount" placeholder="0" required step="1" type="number" /></div></label>
        <div className="modal-actions"><button className="button button--quiet" onClick={onClose} type="button">Cancel</button><button className="button button--primary" type="submit"><Plus size={16} /> Add savings</button></div>
      </form>
    </ModalFrame>
  )
}

export default App
