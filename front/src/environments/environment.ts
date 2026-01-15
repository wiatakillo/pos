// Helper to get window config, treating empty string as valid (for relative URLs via HAProxy)
const getWindowConfig = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = (window as any)[key];
  return value !== undefined ? value : fallback;
};

export const environment = {
  production: false,
  apiUrl: getWindowConfig('__API_URL__', '/api'),
  wsUrl: getWindowConfig('__WS_URL__', '/ws'),
  stripePublishableKey: getWindowConfig('__STRIPE_PUBLISHABLE_KEY__', ''),
  version: '1.0.0',
  commitHash: commitHash,
};
