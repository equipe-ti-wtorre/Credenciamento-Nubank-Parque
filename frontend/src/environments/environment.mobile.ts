export const environment = {
  production: true,
  apiBaseUrl: 'https://cred.nbpdev.com.br/api/v1',
  msalConfig: {
    auth: {
      clientId: '',
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: 'com.credenciamento.app://auth',
    },
  },
};
