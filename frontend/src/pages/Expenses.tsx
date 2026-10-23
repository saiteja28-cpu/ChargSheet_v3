
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Expenses.css';

export default function Expenses() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'individual' | 'group'>('individual');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  type ChargeSheetUser = {
  id: string;
  full_name: string;
};

const [users, setUsers] = useState<ChargeSheetUser[]>([]);
const [payerId, setPayerId] = useState('');
const [usersLoading, setUsersLoading] = useState(true);

useEffect(() => {
  async function loadUsers() {
    setUsersLoading(true);

    const { data, error } = await supabase.rpc('get_charge_sheet_users');

    if (error) {
      setErrorMessage(`Could not load users: ${error.message}`);
    } else {
      setUsers((data ?? []) as ChargeSheetUser[]);
    }

    setUsersLoading(false);
  }

  void loadUsers();
}, []);

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setMessage('');
  setErrorMessage('');

  if (type !== 'individual') {
    setErrorMessage(
      'Group expenses are not available yet. Please select Individual.',
    );
    return;
  }

  if (!payerId) {
    setErrorMessage('Please select the person who owes you.');
    return;
  }

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    setErrorMessage('Enter an amount greater than ₹0.');
    return;
  }

  setBusy(true);

  try {
    const { data, error } = await supabase.rpc('create_charge_sheet', {
      p_title: title.trim(),
      p_description: description.trim(),
      p_total_amount: Number(amount),
      p_payer_id: payerId,
    });

    if (error) throw error;

    setMessage(`Charge sheet created successfully. Reference: ${data}`);
    setTitle('');
    setDescription('');
    setAmount('');
    setType('individual');
    setPayerId('');
  } catch (error) {
    setErrorMessage(
      error instanceof Error ? error.message : 'Could not create charge sheet.',
    );
  } finally {
    setBusy(false);
  }
}

  return (
    <div className="expense-page">
      <header className="expense-topbar">
        <Link to="/dashboard" className="expense-brand">
          <span className="brand-mark">C</span>
          <span>Charg<span className="brand-light">Sheet</span></span>
        </Link>

        <div className="topbar-right">
          <span className="secure-indicator">
            <span className="secure-dot" />
            Secure workspace
          </span>
          <Link to="/dashboard" className="back-link">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="expense-content">
        <div className="expense-breadcrumb">
          <Link to="/dashboard">Dashboard</Link>
          <span>/</span>
          <span>New expense</span>
        </div>

        <section className="expense-heading">
          <div>
            <div className="eyebrow">EXPENSE MANAGEMENT</div>
            <h1>File a new expense</h1>
            <p>Record an expense now and keep every rupee accounted for.</p>
          </div>
          <div className="heading-icon" aria-hidden="true">↗</div>
        </section>

        <div className="expense-layout">
          <section className="expense-form-card">
            <div className="card-heading">
              <div className="section-icon">＋</div>
              <div>
                <h2>Expense details</h2>
                <p>Enter the information for this expense.</p>
              </div>
              <span className="required-note">* Required</span>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="expense-title">Expense title <span>*</span></label>
                <input
                  id="expense-title"
                  type="text"
                  placeholder="e.g. Dinner with the team"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={150}
                  required
                />
                <small>Give this expense a short, recognisable name.</small>
              </div>

              <div className="field-group">
                <label htmlFor="expense-description">Description</label>
                <textarea
                  id="expense-description"
                  placeholder="Add context, details, or a note..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  maxLength={1000}
                />
                <div className="field-footer">
                  <small>Optional, but useful for keeping records.</small>
                  <small>{description.length}/1000</small>
                </div>
              </div>

              <div className="field-group">
  <label htmlFor="charge-payer">
    Who owes you? <span>*</span>
  </label>

  <select
    id="charge-payer"
    value={payerId}
    onChange={e => setPayerId(e.target.value)}
    required
    disabled={usersLoading || busy}
  >
    <option value="">
      {usersLoading ? 'Loading registered users…' : 'Select a person'}
    </option>

    {users.map(person => (
      <option key={person.id} value={person.id}>
        {person.full_name}
      </option>
    ))}
  </select>

  {!usersLoading && users.length === 0 && (
    <small>
      No other registered users found. Register another test account first.
    </small>
  )}
</div>

              <div className="field-group">
                <label htmlFor="expense-amount">Total amount <span>*</span></label>
                <div className="amount-input">
                  <span>₹</span>
                  <input
                    id="expense-amount"
                    type="number"
                    min="0.01"
                    max="999999999"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                  />
                  <span className="currency-tag">INR</span>
                </div>
                <small>Enter the total amount in Indian rupees.</small>
              </div>

              <div className="field-group">
                <label>Expense type <span>*</span></label>
                <div className="expense-type-options">
                  <button
                    type="button"
                    className={`type-option ${type === 'individual' ? 'selected' : ''}`}
                    onClick={() => setType('individual')}
                    aria-pressed={type === 'individual'}
                  >
                    <span className="type-icon">◉</span>
                    <span className="type-copy">
                      <strong>Individual</strong>
                      <small>An expense for one person</small>
                    </span>
                    <span className="type-radio" />
                  </button>

                  <button
                    type="button"
                    className={`type-option ${type === 'group' ? 'selected' : ''}`}
                    onClick={() => setType('group')}
                    aria-pressed={type === 'group'}
                  >
                    <span className="type-icon">♧</span>
                    <span className="type-copy">
                      <strong>Group expense</strong>
                      <small>An expense shared with a group</small>
                    </span>
                    <span className="type-radio" />
                  </button>
                </div>

                {type === 'group' && (
                  <p className="form-hint">
                    Group selection and splitting will be added in the group-expense phase.
                  </p>
                )}
              </div>

              {errorMessage && (
                <div className="form-alert error-alert" role="alert">
                  <span>!</span>
                  <p>{errorMessage}</p>
                </div>
              )}

              {message && (
                <div className="form-alert success-alert" role="status">
                  <span>✓</span>
                  <div>
                    <strong>Expense recorded</strong>
                    <p>{message}</p>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <Link to="/dashboard" className="cancel-button">Cancel</Link>
                <button type="submit" className="submit-expense" disabled={busy}>
                  {busy ? 'Saving expense…' : 'Save expense'}
                  {!busy && <span>→</span>}
                </button>
              </div>
            </form>
          </section>

          <aside className="expense-sidebar">
            <section className="summary-card">
              <div className="summary-label">EXPENSE SUMMARY</div>
              <div className="summary-amount">
                ₹{amount && Number(amount) > 0
                  ? Number(amount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '0.00'}
              </div>
              <div className="summary-caption">Total expense amount</div>

              <div className="summary-divider" />

              <div className="summary-row">
                <span>Expense type</span>
                <strong>{type === 'individual' ? 'Individual' : 'Group'}</strong>
              </div>
              <div className="summary-row">
                <span>Currency</span>
                <strong>INR (₹)</strong>
              </div>
              <div className="summary-row">
                <span>Initial status</span>
                <span className="draft-badge">Draft</span>
              </div>
            </section>

            <section className="info-card">
              <div className="info-icon">✦</div>
              <h3>Keep it organised</h3>
              <p>
                Use a clear title and description so you can identify this expense
                easily later.
              </p>
            </section>

            <div className="privacy-note">
              <span>♧</span>
              <p><strong>Your records, protected.</strong><br />Only authorised users can access expense records according to your account permissions.</p>
            </div>
          </aside>
        </div>

        <footer className="expense-footer">
          <span>ChargSheet</span>
          <span>Expense tracking, made clearer.</span>
        </footer>
      </main>
    </div>
  );
}
