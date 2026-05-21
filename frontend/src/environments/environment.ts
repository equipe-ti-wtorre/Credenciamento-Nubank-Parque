export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  msalConfig: {
    auth: {
      clientId: '',
      authority: 'https://login.microsoftonline.com/common',
      redirectUri:
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4207',
    },
  },
};
