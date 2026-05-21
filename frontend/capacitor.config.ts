import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.wtorre.credenciamento',
  appName: 'Credenciamento',
  webDir: 'dist/frontend/browser',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
