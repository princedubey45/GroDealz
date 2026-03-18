// src/pages/Login.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import s from './Auth.module.css';

export default function Login() {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'owner' ? '/dashboard' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Gro<span>Dealz</span></div>
        <h1 className={s.title}>Welcome back</h1>
        <p className={s.sub}>Sign in to your account</p>
        {error && <div className={s.error}>{error}</div>}
        <form onSubmit={handle} className={s.form}>
          <input className={s.input} type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <input className={s.input} type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          <button className={s.btn} disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
        </form>
        <div className={s.demo}>
          <div className={s.demoTitle}>Demo Accounts</div>
          <button className={s.demoBtn} onClick={() => setForm({ email:'customer@grodeaz.com', password:'customer123' })}>Customer Login</button>
          <button className={s.demoBtn} onClick={() => setForm({ email:'owner@grodeaz.com', password:'owner123' })}>Owner Login</button>
        </div>
        <p className={s.switch}>No account? <Link to="/register">Sign up</Link></p>
      </div>
    </div>
  );
}
