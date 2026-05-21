export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  msalConfig: {
    auth: {
      clientId: '',
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    },
  },
};
