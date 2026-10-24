import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

type ChargeSheet = {
  id: string;
  title: string;
  original_amount: number | string;
  paid_amount: number | string;
  pending_amount: number | string;
  remaining_amount: number | string;
  available_amount: number | string;
  status: string;
  created_at: string;
  other_person_name: string;
  direction: 'receivable' | 'payable';
};

type PendingRepayment = {
  payment_id: string;
  charge_sheet_id: string;
  title: string;
  amount: number | string;
  payer_name: string;
  created_at: string;
};

const money = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusLabel = (status: string) =>
  status.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

const buttonStyle = {
  padding: '9px 12px',
  border: 'none',
  borderRadius: 7,
  background: '#176b4d',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
} as const;

export default function Dashboard() {
  const { user, role, signOut } = useAuth();

  const [charges, setCharges] = useState<ChargeSheet[]>([]);
  const [pendingRepayments, setPendingRepayments] = useState<PendingRepayment[]>([]);
  const [repaymentAmounts, setRepaymentAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadCharges = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    const [chargesResult, pendingResult] = await Promise.all([
      supabase.rpc('get_my_charge_sheets_with_balances'),
      supabase.rpc('get_pending_repayments'),
    ]);

    if (chargesResult.error) {
      setErrorMessage(chargesResult.error.message);
      setCharges([]);
    } else {
      setCharges((chargesResult.data ?? []) as ChargeSheet[]);
    }

    if (pendingResult.error) {
      setErrorMessage(current =>
        current
          ? `${current} | Pending repayments: ${pendingResult.error.message}`
          : `Could not load pending repayments: ${pendingResult.error.message}`
      );
      setPendingRepayments([]);
    } else {
      setPendingRepayments((pendingResult.data ?? []) as PendingRepayment[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCharges();
  }, [loadCharges]);

  async function handleLogout() {
    try {
      await signOut();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Logout failed.');
    }
  }

  async function requestRepayment(charge: ChargeSheet) {
    const amount = Number(repaymentAmounts[charge.id]);

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a repayment amount greater than zero.');
      return;
    }

    if (amount > Number(charge.available_amount)) {
      setErrorMessage(
        `The available amount for "${charge.title}" is ${money(Number(charge.available_amount))}.`
      );
      return;
    }

    setActionId(charge.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.rpc('request_repayment', {
        p_charge_sheet_id: charge.id,
        p_amount: amount,
      });

      if (error) throw error;

      setSuccessMessage(
        `Repayment of ${money(amount)} submitted. The receiver must confirm it before it counts as paid.`
      );

      setRepaymentAmounts(current => ({ ...current, [charge.id]: '' }));
      await loadCharges();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not request repayment.'
      );
    } finally {
      setActionId('');
    }
  }

  async function confirmRepayment(repayment: PendingRepayment) {
    const confirmed = window.confirm(
      `Confirm that you received ${money(Number(repayment.amount))} from ${repayment.payer_name} for "${repayment.title}"?`
    );

    if (!confirmed) return;

    setActionId(repayment.payment_id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.rpc('confirm_repayment', {
        p_payment_id: repayment.payment_id,
      });

      if (error) throw error;

      setSuccessMessage(
        `Received ${money(Number(repayment.amount))}. The repayment has been confirmed.`
      );

      await loadCharges();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not confirm repayment.'
      );
    } finally {
      setActionId('');
    }
  }

  const activeCharges = charges.filter(c => c.status !== 'cancelled');

  const receivable = activeCharges
    .filter(c => c.direction === 'receivable')
    .reduce((sum, c) => sum + Number(c.remaining_amount), 0);

  const payable = activeCharges
    .filter(c => c.direction === 'payable')
    .reduce((sum, c) => sum + Number(c.remaining_amount), 0);

  const totalPaid = activeCharges
    .filter(c => c.direction === 'payable')
    .reduce((sum, c) => sum + Number(c.paid_amount), 0);

  return (
    <main style={{
      maxWidth: 1200,
      margin: '0 auto',
      padding: '32px 20px',
      color: '#18352b',
      fontFamily: 'Arial, sans-serif',
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 32,
      }}>
        <div>
          <p style={{ color: '#438064', fontWeight: 700, marginBottom: 6 }}>
            CHARGSHEET
          </p>
          <h1 style={{ margin: 0 }}>Your dashboard</h1>
          <p style={{ color: '#66756e' }}>
            Welcome, {user?.email ?? 'user'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => void loadCharges()}
            disabled={loading || Boolean(actionId)}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>

          <Link
            to="/expenses/new"
            style={{
              background: '#176b4d',
              color: '#fff',
              padding: '11px 16px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            + File a charge sheet
          </Link>

          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" style={{
          padding: 14,
          borderRadius: 10,
          background: '#fff0f0',
          color: '#a52b2b',
          marginBottom: 16,
          overflowWrap: 'anywhere',
        }}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div role="status" style={{
          padding: 14,
          borderRadius: 10,
          background: '#e7f7ec',
          color: '#176b4d',
          marginBottom: 16,
        }}>
          {successMessage}
        </div>
      )}

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <article style={{
          padding: 22,
          border: '1px solid #dce9e1',
          borderRadius: 14,
          background: '#f0f8f3',
        }}>
          <p style={{ marginTop: 0, color: '#537262' }}>Outstanding receivable</p>
          <h2 style={{ marginBottom: 0, color: '#176b4d' }}>
            {money(receivable)}
          </h2>
        </article>

        <article style={{
          padding: 22,
          border: '1px solid #e9e0d3',
          borderRadius: 14,
          background: '#fff9f0',
        }}>
          <p style={{ marginTop: 0, color: '#80694e' }}>Outstanding payable</p>
          <h2 style={{ marginBottom: 0, color: '#9b6021' }}>
            {money(payable)}
          </h2>
        </article>

        <article style={{
          padding: 22,
          border: '1px solid #dce5ee',
          borderRadius: 14,
          background: '#f4f8fc',
        }}>
          <p style={{ marginTop: 0, color: '#5b6d80' }}>You have paid</p>
          <h2 style={{ marginBottom: 0 }}>{money(totalPaid)}</h2>
        </article>

        <article style={{
          padding: 22,
          border: '1px solid #dce9e1',
          borderRadius: 14,
          background: '#fff',
        }}>
          <p style={{ marginTop: 0, color: '#66756e' }}>Charge sheets</p>
          <h2 style={{ marginBottom: 0 }}>{charges.length}</h2>
        </article>
      </section>

      {role === 'admin' && (
        <p><Link to="/admin">Open Admin Page</Link></p>
      )}

      <section style={{ marginBottom: 36 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}>
          <h2 style={{ margin: 0 }}>Pending repayment confirmations</h2>
          <span style={{ color: '#718078', fontSize: 14 }}>
            {pendingRepayments.length} awaiting your confirmation
          </span>
        </div>

        {pendingRepayments.length === 0 ? (
          <p style={{
            padding: 20,
            border: '1px solid #e0e8e3',
            borderRadius: 12,
            color: '#66756e',
          }}>
            No repayments are waiting for your confirmation.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}>
            {pendingRepayments.map(repayment => (
              <article key={repayment.payment_id} style={{
                border: '1px solid #e0e8e3',
                borderRadius: 12,
                padding: 18,
              }}>
                <h3 style={{ marginTop: 0 }}>{repayment.title}</h3>
                <p>
                  <strong>{repayment.payer_name}</strong> reported a repayment of
                </p>
                <h2 style={{ color: '#176b4d' }}>
                  {money(Number(repayment.amount))}
                </h2>
                <p style={{ color: '#718078', fontSize: 13 }}>
                  Reported {new Date(repayment.created_at).toLocaleString('en-IN')}
                </p>
                <button
                  style={buttonStyle}
                  disabled={Boolean(actionId)}
                  onClick={() => void confirmRepayment(repayment)}
                >
                  {actionId === repayment.payment_id
                    ? 'Confirming…'
                    : 'Confirm Received'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}>
          <h2 style={{ margin: 0 }}>Your charge sheets</h2>
          <span style={{ color: '#718078', fontSize: 14 }}>Latest first</span>
        </div>

        {loading ? (
          <p>Loading your charge sheets…</p>
        ) : !errorMessage && charges.length === 0 ? (
          <div style={{
            padding: 32,
            textAlign: 'center',
            border: '1px dashed #cbd9d0',
            borderRadius: 14,
          }}>
            <h3>No charge sheets yet</h3>
            <p style={{ color: '#66756e' }}>
              File your first charge sheet to see its amount and status here.
            </p>
            <Link to="/expenses/new">Create your first charge sheet</Link>
          </div>
        ) : (
          <div style={{
            border: '1px solid #e0e8e3',
            borderRadius: 14,
            overflowX: 'auto',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              minWidth: 900,
            }}>
              <thead style={{ background: '#f4f8f5' }}>
                <tr>
                  {[
                    'Expense',
                    'Person',
                    'Direction',
                    'Original',
                    'Paid',
                    'Pending',
                    'Remaining',
                    'Status',
                    'Repayment',
                  ].map(label => (
                    <th key={label} style={{
                      padding: 12,
                      fontSize: 12,
                      color: '#607269',
                      whiteSpace: 'nowrap',
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {charges.map(charge => {
                  const available = Number(charge.available_amount);
                  const canRequest =
                    charge.direction === 'payable' &&
                    ['pending', 'partially_paid'].includes(charge.status) &&
                    available > 0;

                  return (
                    <tr key={charge.id} style={{
                      borderTop: '1px solid #e7eee9',
                      verticalAlign: 'top',
                    }}>
                      <td style={{ padding: 12, fontWeight: 600 }}>
                        {charge.title}
                        <div style={{
                          fontSize: 12,
                          color: '#7b8981',
                          marginTop: 5,
                        }}>
                          {new Date(charge.created_at).toLocaleDateString('en-IN')}
                        </div>
                      </td>

                      <td style={{ padding: 12 }}>{charge.other_person_name}</td>

                      <td style={{ padding: 12 }}>
                        {charge.direction === 'receivable' ? 'Owed to you' : 'You owe'}
                      </td>

                      <td style={{ padding: 12 }}>
                        {money(Number(charge.original_amount))}
                      </td>

                      <td style={{ padding: 12, color: '#176b4d' }}>
                        {money(Number(charge.paid_amount))}
                      </td>

                      <td style={{ padding: 12, color: '#9b6021' }}>
                        {money(Number(charge.pending_amount))}
                      </td>

                      <td style={{ padding: 12, fontWeight: 700 }}>
                        {money(Number(charge.remaining_amount))}
                      </td>

                      <td style={{ padding: 12 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '5px 9px',
                          borderRadius: 20,
                          background: charge.status === 'paid'
                            ? '#e2f5e9'
                            : charge.status === 'partially_paid'
                              ? '#e8f0ff'
                              : '#fff2d8',
                          color: charge.status === 'paid'
                            ? '#176b4d'
                            : charge.status === 'partially_paid'
                              ? '#315da8'
                              : '#8a621c',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}>
                          {statusLabel(charge.status)}
                        </span>
                      </td>

                      <td style={{ padding: 12, minWidth: 175 }}>
                        {canRequest ? (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}>
                            <input
                              type="number"
                              min="0.01"
                              max={available}
                              step="0.01"
                              value={repaymentAmounts[charge.id] ?? ''}
                              onChange={event =>
                                setRepaymentAmounts(current => ({
                                  ...current,
                                  [charge.id]: event.target.value,
                                }))
                              }
                              placeholder={`Max ${available.toFixed(2)}`}
                              aria-label={`Repayment amount for ${charge.title}`}
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: 9,
                                border: '1px solid #cbd9d0',
                                borderRadius: 7,
                              }}
                            />
                            <button
                              style={buttonStyle}
                              disabled={Boolean(actionId) || loading}
                              onClick={() => void requestRepayment(charge)}
                            >
                              {actionId === charge.id
                                ? 'Submitting…'
                                : 'Request Repayment'}
                            </button>
                          </div>
                        ) : charge.direction === 'payable' &&
                          Number(charge.pending_amount) > 0 ? (
                          <span style={{ fontSize: 12, color: '#9b6021' }}>
                            Awaiting confirmation
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#718078' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ marginTop: 32, color: '#7b8981', fontSize: 13 }}>
        Signed in as {user?.email} · Role: {role ?? 'Loading…'}
      </p>
    </main>
  );
}
