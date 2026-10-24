
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type ChargeSheetDetailsData = {
  id: string;
  title: string;
  original_amount: number | string;
  paid_amount: number | string;
  pending_amount: number | string;
  remaining_amount: number | string;
  available_amount: number | string;
  status: string;
  created_at: string;
  payer_name: string;
  receiver_name: string;
  direction: 'receivable' | 'payable';
};

type PaymentHistoryItem = {
  payment_id: string;
  amount: number | string;
  payment_status: string;
  payment_method: string;
  payment_created_at: string;
  payment_updated_at: string;
  payer_name: string;
};

const money = (value: number | string) =>
  `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusLabel = (status: string) =>
  status.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

const panelStyle = {
  padding: 20,
  border: '1px solid #dce9e1',
  borderRadius: 12,
  background: '#fff',
} as const;

export default function ChargeSheetDetails() {
  const { id } = useParams<{ id: string }>();

  const [charge, setCharge] = useState<ChargeSheetDetailsData | null>(null);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadDetails = useCallback(async () => {
    if (!id) {
      setErrorMessage('Invalid ChargeSheet ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const [detailsResult, historyResult] = await Promise.all([
        supabase.rpc('get_charge_sheet_details', {
          p_charge_sheet_id: id,
        }),
        supabase.rpc('get_charge_sheet_payment_history', {
          p_charge_sheet_id: id,
        }),
      ]);

      if (detailsResult.error) throw detailsResult.error;
      if (historyResult.error) throw historyResult.error;

      const details = (detailsResult.data ?? []) as ChargeSheetDetailsData[];

      if (details.length === 0) {
        setCharge(null);
        setHistory([]);
        setErrorMessage(
          'ChargeSheet not found, or you do not have permission to view it.'
        );
        return;
      }

      setCharge(details[0]);
      setHistory((historyResult.data ?? []) as PaymentHistoryItem[]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load ChargeSheet details.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const pageStyle = {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '32px 20px',
    color: '#18352b',
    fontFamily: 'Arial, sans-serif',
  } as const;

  if (loading) {
    return <main style={pageStyle}>Loading ChargeSheet details…</main>;
  }

  return (
    <main style={pageStyle}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <p style={{ color: '#438064', fontWeight: 700 }}>CHARGSHEET</p>
          <h1 style={{ marginBottom: 8 }}>ChargeSheet details</h1>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => void loadDetails()}>Refresh</button>
          <Link to="/dashboard">Back to dashboard</Link>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          style={{
            ...panelStyle,
            background: '#fff0f0',
            color: '#a52b2b',
            marginBottom: 20,
            overflowWrap: 'anywhere',
          }}
        >
          {errorMessage}
        </div>
      )}

      {charge && (
        <>
          <section style={{ ...panelStyle, marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>{charge.title}</h2>

            <p>
              <strong>Payer:</strong> {charge.payer_name}
            </p>
            <p>
              <strong>Receiver:</strong> {charge.receiver_name}
            </p>
            <p>
              <strong>Created:</strong>{' '}
              {new Date(charge.created_at).toLocaleString('en-IN')}
            </p>
            <p>
              <strong>Status:</strong> {statusLabel(charge.status)}
            </p>
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14,
              marginBottom: 32,
            }}
          >
            {[
              {
                label: 'Original amount',
                amount: charge.original_amount,
              },
              {
                label: 'Confirmed paid',
                amount: charge.paid_amount,
              },
              {
                label: 'Pending confirmation',
                amount: charge.pending_amount,
              },
              {
                label: 'Outstanding balance',
                amount: charge.remaining_amount,
              },
              {
                label: 'Available for repayment',
                amount: charge.available_amount,
              },
            ].map(item => (
              <article key={item.label} style={panelStyle}>
                <p style={{ color: '#66756e', marginTop: 0 }}>
                  {item.label}
                </p>
                <h2 style={{ marginBottom: 0 }}>
                  {money(item.amount)}
                </h2>
              </article>
            ))}
          </section>

          <section>
            <h2>Repayment history</h2>
            <p style={{ color: '#66756e' }}>
              {history.length} repayment record
              {history.length === 1 ? '' : 's'}
            </p>

            {history.length === 0 ? (
              <div style={panelStyle}>
                No repayment requests have been recorded for this
                ChargeSheet yet.
              </div>
            ) : (
              <div
                style={{
                  ...panelStyle,
                  padding: 0,
                  overflowX: 'auto',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    minWidth: 680,
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                  }}
                >
                  <thead style={{ background: '#f4f8f5' }}>
                    <tr>
                      {[
                        'Date',
                        'Payer',
                        'Amount',
                        'Method',
                        'Status',
                        'Last updated',
                      ].map(label => (
                        <th
                          key={label}
                          style={{
                            padding: 12,
                            fontSize: 13,
                            color: '#607269',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {history.map(payment => (
                      <tr
                        key={payment.payment_id}
                        style={{ borderTop: '1px solid #e7eee9' }}
                      >
                        <td style={{ padding: 12 }}>
                          {new Date(
                            payment.payment_created_at
                          ).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: 12 }}>
                          {payment.payer_name}
                        </td>
                        <td
                          style={{
                            padding: 12,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {money(payment.amount)}
                        </td>
                        <td style={{ padding: 12 }}>
                          {statusLabel(payment.payment_method)}
                        </td>
                        <td style={{ padding: 12 }}>
                          {statusLabel(payment.payment_status)}
                        </td>
                        <td style={{ padding: 12 }}>
                          {new Date(
                            payment.payment_updated_at
                          ).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
