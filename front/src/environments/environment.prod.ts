export const environment = {
  production: true,
  apiUrl: (typeof window !== 'undefined' && (window as any).__API_URL__) || 'http://localhost:8020',
  wsUrl: (typeof window !== 'undefined' && (window as any).__WS_URL__) || 'ws://localhost:8021',
  stripePublishableKey: (typeof window !== 'undefined' && (window as any).__STRIPE_PUBLISHABLE_KEY__) || '',
  version: '1.0.0',
};
