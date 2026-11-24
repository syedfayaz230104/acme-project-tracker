import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { email: 'admin@acme.com', role: 'Admin' },
  { email: 'manager@acme.com', role: 'Manager' },
  { email: 'contributor@acme.com', role: 'Contributor' },
  { email: 'viewer@acme.com', role: 'Viewer' },
];

/** Sign-in page with client-side validation and one-click demo accounts. */
export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!email.trim()) found.email = 'Email is required';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) found.email = 'Enter a valid email';
    if (!password) found.password = 'Password is required';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        background: 'linear-gradient(135deg, #1e3a8a 0%, #0f766e 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }} variant="elevation" elevation={8}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }} color="primary">ACME Projects</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in to track projects, deliverables, resources and budgets.
          </Typography>
          {sessionExpired && !error && (
            <Alert severity="info" sx={{ mb: 2 }}>Your session expired. Please sign in again.</Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={Boolean(errors.email)}
                helperText={errors.email}
                disabled={busy}
                required
                fullWidth
                autoFocus
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(errors.password)}
                helperText={errors.password}
                disabled={busy}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" loading={busy}>Sign in</Button>
            </Stack>
          </Box>
          <Divider sx={{ my: 3 }}>Demo accounts</Divider>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Password for all: <strong>Password123</strong>
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => { setEmail(a.email); setPassword('Password123'); setErrors({}); }}
              >
                {a.role}
              </Button>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
