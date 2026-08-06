import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private _isNative = false;
  private _clientType: 'web' | 'android' | 'ios' = 'web';

  setNative(platform: 'android' | 'ios') {
    this._isNative = true;
    this._clientType = platform;
  }

  isNative(): boolean {
    return this._isNative;
  }

  getClientType(): 'web' | 'android' | 'ios' {
    return this._clientType;
  }
}
