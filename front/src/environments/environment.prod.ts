import { commitHash } from './commit-hash';

export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__) || '/api',
  wsUrl: (typeof window !== 'undefined' && (window as any).__WS_URL__) || (typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws` : 'ws://localhost:8021'),
  stripePublishableKey: (typeof window !== 'undefined' && (window as any).__STRIPE_PUBLISHABLE_KEY__) || '',
  version: '1.0.0',
  commitHash: commitHash,
};
