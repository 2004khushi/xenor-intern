// app/routes/login.tsx
import { redirect } from '@remix-run/node';
import { Link, useSearchParams } from '@remix-run/react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Your App Name</h1>
      <p>Click below to access your dashboard</p>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      <Link to="/dashboard">
        <button style={{ 
          padding: '1rem 2rem', 
          fontSize: '1.2rem',
          backgroundColor: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Go to Dashboard
        </button>
      </Link>
    </div>
  );
}