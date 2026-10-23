
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

type ChargeSheet = {
  id: string;
  title: string;
  original_amount: number | string;
  status: string;
  created_at: string;
  other_person_name: string;
  direction: 'receivable' | 'payable';
};

const money = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function Dashboard() {
  const { user, role, signOut } = useAuth();
  const [charges, setCharges] = useState<ChargeSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCharges = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase.rpc('get_my_charge_sheets');

    if (error) {
      setErrorMessage(error.message);
      setCharges([]);
    } else {
      setCharges((data ?? []) as ChargeSheet[]);
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

  const receivable = charges
    .filter(c => c.direction === 'receivable' && c.status !== 'cancelled')
    .reduce((sum, c) => sum + Number(c.original_amount), 0);

  const payable = charges
    .filter(c => c.direction === 'payable' && c.status !== 'cancelled')
    .reduce((sum, c) => sum + Number(c.original_amount), 0);

  const statusLabel = (status: string) =>
    status.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <main style={{
      maxWidth: 1100,
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
          <button onClick={() => void loadCharges()} disabled={loading}>
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

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <article style={{
          padding: 22, border: '1px solid #dce9e1',
          borderRadius: 14, background: '#f0f8f3',
        }}>
          <p style={{ marginTop: 0, color: '#537262' }}>Owed to you</p>
          <h2 style={{ marginBottom: 0, color: '#176b4d' }}>
            {money(receivable)}
          </h2>
        </article>

        <article style={{
          padding: 22, border: '1px solid #e9e0d3',
          borderRadius: 14, background: '#fff9f0',
        }}>
          <p style={{ marginTop: 0, color: '#80694e' }}>You owe</p>
          <h2 style={{ marginBottom: 0, color: '#9b6021' }}>
            {money(payable)}
          </h2>
        </article>

        <article style={{
          padding: 22, border: '1px solid #dce5ee',
          borderRadius: 14, background: '#f4f8fc',
        }}>
          <p style={{ marginTop: 0, color: '#5b6d80' }}>Charge sheets</p>
          <h2 style={{ marginBottom: 0 }}>{charges.length}</h2>
        </article>
      </section>

      {role === 'admin' && (
        <p><Link to="/admin">Open Admin Page</Link></p>
      )}

      <section>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}>
          <h2 style={{ margin: 0 }}>Recent charge sheets</h2>
          <span style={{ color: '#718078', fontSize: 14 }}>
            Latest first
          </span>
        </div>

        {errorMessage && (
          <div role="alert" style={{
            padding: 16, borderRadius: 10,
            background: '#fff0f0', color: '#a52b2b',
          }}>
            Could not load charge sheets: {errorMessage}
          </div>
        )}

        {loading ? (
          <p>Loading your charge sheets…</p>
        ) : !errorMessage && charges.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center',
            border: '1px dashed #cbd9d0', borderRadius: 14,
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
              width: '100%', borderCollapse: 'collapse',
              textAlign: 'left', minWidth: 600,
            }}>
              <thead style={{ background: '#f4f8f5' }}>
                <tr>
                  {['Expense', 'Person', 'Direction', 'Amount', 'Status'].map(label => (
                    <th key={label} style={{
                      padding: 14, fontSize: 13, color: '#607269',
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {charges.map(charge => (
                  <tr key={charge.id} style={{ borderTop: '1px solid #e7eee9' }}>
                    <td style={{ padding: 14, fontWeight: 600 }}>
                      {charge.title}
                      <div style={{
                        fontSize: 12, color: '#7b8981', marginTop: 5,
                      }}>
                        {new Date(charge.created_at).toLocaleDateString('en-IN')}
                      </div>
                    </td>
                    <td style={{ padding: 14 }}>{charge.other_person_name}</td>
                    <td style={{ padding: 14 }}>
                      {charge.direction === 'receivable' ? 'Owed to you' : 'You owe'}
                    </td>
                    <td style={{ padding: 14, fontWeight: 700 }}>
                      {money(Number(charge.original_amount))}
                    </td>
                    <td style={{ padding: 14 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '5px 9px',
                        borderRadius: 20,
                        background: charge.status === 'paid' ? '#e2f5e9' : '#fff2d8',
                        color: charge.status === 'paid' ? '#176b4d' : '#8a621c',
                        fontSize: 12,
                      }}>
                        {statusLabel(charge.status)}
                      </span>
                    </td>
                  </tr>
                ))}
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
