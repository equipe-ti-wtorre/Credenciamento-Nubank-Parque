import { PlatformService } from './services/platform.service';

export async function bootstrapPlatform(platform: PlatformService): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const platformId = Capacitor.getPlatform();
    if (platformId === 'android') {
      platform.setNative('android');
    } else if (platformId === 'ios') {
      platform.setNative('ios');
    }

    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', (event) => {
      console.info('[Credenciamento] Deep link recebido:', event.url);
    });
  } catch {
    /* Capacitor não disponível no browser */
  }
}
