import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

const CATEGORY_OPTIONS = ['Housing', 'Food', 'Travel', 'Software', 'Health', 'Utilities', 'Salary', 'Freelance', 'Savings', 'Subscriptions', 'Other'];
const ACCOUNT_OPTIONS = ['Checking', 'Savings', 'Credit'];
const STORAGE_KEY = 'fynza-demo-mode-v1';
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const defaultTransactions = [
  { id: '1', title: 'Monthly salary', type: 'income', amount: 3200, date: '2026-10-03', category: 'Salary', account: 'Checking', notes: 'Monthly salary deposit' },
  { id: '2', title: 'Apartment rent', type: 'expense', amount: 780, date: '2026-10-04', category: 'Housing', account: 'Checking', notes: 'Rent payment' },
  { id: '3', title: 'Groceries', type: 'expense', amount: 142, date: '2026-10-06', category: 'Food', account: 'Checking', notes: 'Weekly groceries' },
  { id: '4', title: 'Cloud billing', type: 'expense', amount: 96, date: '2026-10-08', category: 'Software', account: 'Checking', notes: 'All-in-one app plan' },
  { id: '5', title: 'Freelance design', type: 'income', amount: 1200, date: '2026-10-11', category: 'Freelance', account: 'Checking', notes: 'Landing page redesign' },
  { id: '6', title: 'Weekend trip', type: 'expense', amount: 420, date: '2026-10-13', category: 'Travel', account: 'Credit', notes: 'Flight and hotel booking' },
  { id: '7', title: 'Emergency fund', type: 'expense', amount: 620, date: '2026-10-15', category: 'Savings', account: 'Checking', notes: 'Automated transfer' },
  { id: '8', title: 'Doctor visit', type: 'expense', amount: 180, date: '2026-10-17', category: 'Health', account: 'Credit', notes: 'Consultation' },
];

const formatCurrency = (value) => currency.format(value || 0);

const loadLocalTransactions = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultTransactions;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultTransactions;
  } catch (error) {
    console.warn('Could not read local storage', error);
    return defaultTransactions;
  }
};

const mapDbRowToTx = (row) => ({
  id: String(row.id),
  title: row.title,
  type: row.type,
  amount: Number(row.amount),
  date: row.date,
  category: row.category,
  account: row.account,
  notes: row.notes || '',
});

function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [transactions, setTransactions] = useState(loadLocalTransactions());
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState('');
  const [syncState, setSyncState] = useState('local');
  const [form, setForm] = useState({
    title: '',
    type: 'expense',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Housing',
    account: 'Checking',
    notes: '',
  });

  useEffect(() => {
    if (!supabase) return;

    const restoreSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    };

    restoreSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setTransactions(loadLocalTransactions());
      setSyncState('local');
      return;
    }

    if (!supabase) return;

    const fetchRemoteTransactions = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (!error && Array.isArray(data)) {
        setTransactions(data.map(mapDbRowToTx));
        setSyncState('supabase');
        return;
      }

      console.warn('Supabase fetch failed', error?.message || error);
      setTransactions(loadLocalTransactions());
      setSyncState('local');
    };

    fetchRemoteTransactions();
  }, [session]);

  useEffect(() => {
    if (!session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }
  }, [session, transactions]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timeout);
  }, [toast]);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [transactions]);

  const filteredTransactions = useMemo(() => {
    return [...transactions]
      .filter((t) => (selectedMonth === 'all' ? true : t.date.startsWith(selectedMonth)))
      .filter((t) => (selectedCategory === 'all' ? true : t.category === selectedCategory))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, selectedMonth, selectedCategory]);

  const summary = useMemo(() => {
    const income = filteredTransactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = filteredTransactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const net = income - expense;
    const savings = income - expense;
    return { income, expense, net, savings };
  }, [filteredTransactions]);

  const budgetData = useMemo(() => {
    const spentByCategory = {};
    filteredTransactions.filter((t) => t.type === 'expense').forEach((t) => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + Number(t.amount);
    });

    const budgetLimits = { Housing: 2100, Food: 700, Travel: 900, Software: 250 };

    return Object.entries(budgetLimits).map(([label, limit]) => ({
      label,
      limit,
      spent: spentByCategory[label] || 0,
      progress: Math.min(((spentByCategory[label] || 0) / limit) * 100, 100),
    }));
  }, [filteredTransactions]);

  const categoryMix = useMemo(() => {
    const totals = {};
    filteredTransactions.filter((t) => t.type === 'expense').forEach((t) => {
      totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
    });

    const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
        percentage: (value / total) * 100,
        color: label === 'Housing' ? '#2563eb' : label === 'Food' ? '#60a5fa' : label === 'Travel' ? '#a78bfa' : '#fbbf24',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [filteredTransactions]);

  const saveTransactionLocally = (payload) => {
    setTransactions((current) => {
      const exists = current.some((item) => item.id === payload.id);
      if (exists) {
        return current.map((item) => (item.id === payload.id ? payload : item));
      }
      return [payload, ...current];
    });
  };

  const persistTransaction = async (transaction) => {
    const userId = session?.user?.id;

    if (!supabase || !session || !userId) {
      saveTransactionLocally(transaction);
      return;
    }

    const { error } = await supabase
      .from('transactions')
      .upsert({
        id: transaction.id,
        user_id: userId,
        title: transaction.title,
        type: transaction.type,
        amount: Number(transaction.amount),
        date: transaction.date,
        category: transaction.category,
        account: transaction.account,
        notes: transaction.notes || '',
      }, { onConflict: 'id' });

    if (error) {
      console.warn('Supabase save error', error.message);
      saveTransactionLocally(transaction);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (!fetchError && Array.isArray(data)) {
      setTransactions(data.map(mapDbRowToTx));
    }
  };

  const removeTransaction = async (id) => {
    if (supabase && session) {
      const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', session.user.id);
      if (!error) {
        const { data } = await supabase.from('transactions').select('*').eq('user_id', session.user.id).order('date', { ascending: false });
        if (Array.isArray(data)) setTransactions(data.map(mapDbRowToTx));
        return;
      }
      console.warn('Supabase delete failed', error.message);
    }

    setTransactions((current) => current.filter((tx) => tx.id !== id));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (!supabase) {
      setAuthError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setIsAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
        });

        if (error) throw error;
        setAuthMessage('Account created. Check your email for the confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        });

        if (error) throw error;
        setAuthMessage('Signed in successfully.');
      }
    } catch (error) {
      setAuthError(error.message || 'Authentication failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setSelectedMonth('all');
    setSelectedCategory('all');
    setTransactions(loadLocalTransactions());
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ title: '', type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10), category: 'Housing', account: 'Checking', notes: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (id) => {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;
    setEditingId(id);
    setForm({
      title: tx.title,
      type: tx.type,
      amount: String(tx.amount),
      date: tx.date,
      category: tx.category,
      account: tx.account,
      notes: tx.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim() || !form.date || Number(form.amount) <= 0) {
      setToast('Complete the form before saving.');
      return;
    }

    const nextTx = {
      id: editingId || crypto.randomUUID(),
      title: form.title.trim(),
      type: form.type,
      amount: Number(form.amount),
      date: form.date,
      category: form.category,
      account: form.account,
      notes: form.notes.trim(),
    };

    await persistTransaction(nextTx);

    setIsModalOpen(false);
    setToast(editingId ? 'Transaction updated.' : 'Transaction added.');
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await removeTransaction(id);
    setToast('Transaction deleted.');
  };

  const budgetUsed = budgetData.reduce((sum, item) => sum + item.spent, 0) / budgetData.reduce((sum, item) => sum + item.limit, 0);
  const savingsRate = summary.income > 0 ? (summary.savings / summary.income) * 100 : 0;
  const recurring = filteredTransactions.filter((t) => ['Software', 'Utilities', 'Housing', 'Subscriptions'].includes(t.category)).reduce((sum, t) => sum + Number(t.amount), 0);

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-row">
            <div className="brand-mark">F</div>
            <div>
              <div className="brand-title">Fynza</div>
              <small>Personal finance dashboard</small>
            </div>
          </div>

          <div className="auth-toggle">
            <button type="button" className={authMode === 'login' ? 'toggle active' : 'toggle'} onClick={() => setAuthMode('login')}>Log in</button>
            <button type="button" className={authMode === 'signup' ? 'toggle active' : 'toggle'} onClick={() => setAuthMode('signup')}>Sign up</button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              <span>Email</span>
              <input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
            </label>

            <label>
              <span>Password</span>
              <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} minLength="6" required />
            </label>

            {authError && <div className="auth-error">{authError}</div>}
            {authMessage && <div className="auth-success">{authMessage}</div>}

            <button type="submit" className="button primary full" disabled={isAuthLoading}>
              {isAuthLoading ? 'Please wait...' : authMode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="auth-footnote">
            {supabase ? 'Secure auth is active via Supabase.' : 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">F</div>
            <span>Fynza</span>
          </div>

          <nav className="nav" aria-label="Main navigation">
            <a href="#overview" aria-current="page">Overview</a>
            <a href="#budgeting">Budgeting</a>
            <a href="#activity">Activity</a>
            <a href="#insights">Insights</a>
          </nav>

          <div className="header-actions">
            <span className="sync-pill">{syncState === 'supabase' ? 'Synced to Supabase' : 'Local demo mode'}</span>
            <button className="button ghost" type="button" onClick={() => setToast('Export started.')}>Export</button>
            <button className="button primary" type="button" onClick={openCreateModal}>Add transaction</button>
            <button className="button ghost" type="button" onClick={handleSignOut}>Log out</button>
          </div>
        </div>
      </header>

      <main>
        <div className="container">
          <section className="hero" id="overview">
            <div className="card hero-panel">
              <span className="eyebrow">Finance overview</span>
              <h1>Plan smarter, spend clearer.</h1>
              <p>Track your money in one place with live summaries, budgets, and a clean command center for your monthly cash flow.</p>
              <div className="hero-actions">
                <button className="button primary" type="button" onClick={openCreateModal}>Open dashboard</button>
                <button className="button ghost" type="button">View report</button>
              </div>
            </div>

            <aside className="card quick-summary" aria-label="Financial summary">
              <div className="mini-stat good">
                <div>
                  <span>Net cash flow</span>
                  <strong>{formatCurrency(summary.net)}</strong>
                </div>
                <div className="badge good">{summary.income > 0 ? `${((summary.net / summary.income) * 100).toFixed(1)}%` : '0%'}</div>
              </div>

              <div className="mini-stat">
                <div>
                  <span>Budget used</span>
                  <strong>{`${(budgetUsed * 100).toFixed(0)}%`}</strong>
                </div>
                <div className="badge warn">{budgetUsed > 0.8 ? 'High' : budgetUsed > 0.6 ? 'On track' : 'Healthy'}</div>
              </div>

              <div className="mini-stat bad">
                <div>
                  <span>High-risk spend</span>
                  <strong>{formatCurrency(Math.max(0, summary.expense * 0.12))}</strong>
                </div>
                <div className="badge warn">{summary.expense * 0.12 > 1000 ? 'Needs review' : 'Stable'}</div>
              </div>
            </aside>
          </section>

          <section className="stat-grid" aria-label="Key metrics">
            <article className="card stat-card">
              <span className="label">Income</span>
              <div className="value">{formatCurrency(summary.income)}</div>
              <div className="trend up"><strong>▲ 12.8%</strong> vs last month</div>
            </article>

            <article className="card stat-card">
              <span className="label">Expenses</span>
              <div className="value">{formatCurrency(summary.expense)}</div>
              <div className="trend down"><strong>▼ 3.1%</strong> from target</div>
            </article>

            <article className="card stat-card">
              <span className="label">Savings</span>
              <div className="value">{formatCurrency(summary.savings)}</div>
              <div className="trend up"><strong>▲ 18.4%</strong> this cycle</div>
            </article>

            <article className="card stat-card">
              <span className="label">Debt</span>
              <div className="value">{formatCurrency(Math.max(0, summary.expense * 0.18))}</div>
              <div className="trend down"><strong>▼ 6.7%</strong> reduction</div>
            </article>
          </section>

          <section className="layout">
            <div className="card panel" id="activity">
              <div className="panel-header">
                <h2>Recent activity</h2>
                <span className="chip">Live</span>
              </div>

              <div className="toolbar">
                <div className="filters">
                  <select className="select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                    <option value="all">All months</option>
                    {months.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>

                  <select className="select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                    <option value="all">All categories</option>
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <button className="button ghost" type="button" onClick={() => { setSelectedMonth('all'); setSelectedCategory('all'); }}>
                  Clear filters
                </button>
              </div>

              <div className="list">
                {filteredTransactions.length ? filteredTransactions.map((tx) => (
                  <div className="row" key={tx.id}>
                    <div className="logo-box" style={{ background: tx.type === 'income' ? 'linear-gradient(135deg, #0f8f63, #2ec27e)' : 'linear-gradient(135deg, #2563eb, #3b82f6)' }}>
                      {tx.title.charAt(0).toUpperCase()}
                    </div>

                    <div className="row-main">
                      <strong>{tx.title}</strong>
                      <small>{tx.category} • {tx.account} • {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                    </div>

                    <div className={`badge ${tx.type === 'income' ? 'good' : 'warn'}`}>{tx.type === 'income' ? 'Income' : 'Expense'}</div>

                    <div className="row-actions">
                      <div className={`amount ${tx.type === 'income' ? 'positive' : 'negative'}`}>{tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}</div>
                      <button className="icon-button" type="button" onClick={() => openEditModal(tx.id)}>✎</button>
                      <button className="icon-button" type="button" onClick={() => handleDelete(tx.id)}>🗑</button>
                    </div>
                  </div>
                )) : (
                  <div className="empty-state">No transactions match the current filters.</div>
                )}
              </div>
            </div>

            <aside className="stack" id="budgeting">
              <div className="card panel stack-card">
                <div className="panel-header">
                  <h2>Budget health</h2>
                  <span className="chip">This month</span>
                </div>

                <div className="budget-list">
                  {budgetData.map((item) => (
                    <div className="budget-item" key={item.label}>
                      <div className="budget-head">
                        <span>{item.label}</span>
                        <strong>{formatCurrency(item.spent)} / {formatCurrency(item.limit)}</strong>
                      </div>
                      <div className="meter"><span style={{ width: `${item.progress}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card panel stack-card">
                <div className="panel-header">
                  <h2>Category mix</h2>
                  <span className="chip">FY25</span>
                </div>

                <div className="ring" aria-label="Expense breakdown chart">
                  <div className="ring-inner">{categoryMix[0] ? `${Math.round(categoryMix[0].percentage)}%` : '0%'}</div>
                </div>

                <div className="legend">
                  {categoryMix.map((item) => (
                    <div className="legend-item" key={item.label}>
                      <span><span className="dot" style={{ background: item.color }} />{item.label}</span>
                      <strong>{Math.round(item.percentage)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>

          <section className="bottom-grid" id="insights">
            <div className="card panel">
              <div className="panel-header">
                <h2>Key insights</h2>
                <span className="chip">Updated today</span>
              </div>

              <div className="insight-grid">
                <div className="insight-item">
                  <span className="label">Savings rate</span>
                  <strong>{`${((summary.income > 0 ? summary.savings / summary.income : 0) * 100).toFixed(0)}%`}</strong>
                  <div className="trend up">▲ {Math.abs((summary.income > 0 ? summary.savings / summary.income : 0) * 100).toFixed(1)} pts</div>
                </div>

                <div className="insight-item">
                  <span className="label">Recurring costs</span>
                  <strong>{formatCurrency(recurring)}</strong>
                  <div className="trend down">▼ {((recurring / Math.max(summary.expense, 1)) * 100).toFixed(1)}%</div>
                </div>

                <div className="insight-item">
                  <span className="label">Cash runway</span>
                  <strong>{`${((summary.savings / Math.max(summary.expense, 1)) * 1.8).toFixed(1)} mo`}</strong>
                  <div className="trend up">▲ {((summary.savings / Math.max(summary.expense, 1)) * 1.8).toFixed(1)} mo</div>
                </div>
              </div>
            </div>

            <div className="card panel">
              <div className="panel-header">
                <h2>Action list</h2>
                <span className="chip">Priority</span>
              </div>

              <div className="list">
                <div className="row">
                  <div className="logo-box" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>1</div>
                  <div className="row-main">
                    <strong>Reduce subscriptions</strong>
                    <small>Save $128/month</small>
                  </div>
                  <div className="badge warn">Low</div>
                </div>

                <div className="row">
                  <div className="logo-box" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>2</div>
                  <div className="row-main">
                    <strong>Build emergency reserve</strong>
                    <small>Boost by $620</small>
                  </div>
                  <div className="badge good">Now</div>
                </div>

                <div className="row">
                  <div className="logo-box" style={{ background: 'linear-gradient(135deg, #60a5fa, #2563eb)' }}>3</div>
                  <div className="row-main">
                    <strong>Review travel budget</strong>
                    <small>Potential cut $180</small>
                  </div>
                  <div className="badge warn">This week</div>
                </div>
              </div>
            </div>
          </section>

          <footer className="footer">Fynza — a lightweight dashboard for personal finance clarity.</footer>
        </div>
      </main>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setIsModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>{editingId ? 'Edit transaction' : 'Add transaction'}</h3>
              <button className="button ghost" type="button" onClick={() => setIsModalOpen(false)}>Close</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="field full">
                  <label>Title</label>
                  <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>

                <div className="field">
                  <label>Type</label>
                  <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>

                <div className="field">
                  <label>Amount</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>

                <div className="field">
                  <label>Date</label>
                  <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>

                <div className="field">
                  <label>Category</label>
                  <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Account</label>
                  <select className="select" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
                    {ACCOUNT_OPTIONS.map((account) => (
                      <option key={account} value={account}>{account}</option>
                    ))}
                  </select>
                </div>

                <div className="field full">
                  <label>Notes</label>
                  <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
                </div>
              </div>

              <div className="modal-actions">
                <button className="button ghost" type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button className="button primary" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

export default App;
