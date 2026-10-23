
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      await signUp(name.trim(), email.trim(), password);
      setMessage('Registration submitted. If email confirmation is enabled, check your inbox before logging in.');
      // Supabase may require email confirmation before a session is created.
      navigate('/login', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Create your ChargSheet account</h1>
      <form onSubmit={handleSubmit}>
        <label>Full name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />

        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />

        <label>Password (minimum 6 characters)</label>
        <input type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required />

        <button disabled={busy}>{busy ? 'Creating account...' : 'Register'}</button>
      </form>
      {message && <p role="status">{message}</p>}
      <p>Already registered? <Link to="/login">Log in</Link></p>
    </main>
  );
}
