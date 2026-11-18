import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { blobToDataUrl, isProbablyImageBlob } from '../utils/image-src';

const GRAPH_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photo/$value';

@Injectable({ providedIn: 'root' })
export class MicrosoftProfileService {
  constructor(private api: ApiService) {}

  /** Foto via backend (User.Read.All + client secret do tenant). */
  async fetchPhotoObjectUrlFromApi(): Promise<string | null> {
    try {
      const blob = await firstValueFrom(this.api.getBlob('/auth/profile-photo'));
      return this.toSrc(blob);
    } catch {
      return null;
    }
  }

  /** Foto de outro usuário autenticado (Microsoft Graph via backend). Aceita id numérico ou public_id. */
  async fetchUserPhotoObjectUrl(userId: number | string): Promise<string | null> {
    const key = String(userId ?? '').trim();
    if (!key || key === '0') return null;
    if (/^\d+$/.test(key) && Number(key) <= 0) return null;
    try {
      const blob = await firstValueFrom(this.api.getBlob(`/auth/users/${encodeURIComponent(key)}/photo`));
      return this.toSrc(blob);
    } catch {
      return null;
    }
  }

  /** Fallback: token delegado do MSAL no browser. */
  async fetchPhotoObjectUrlFromGraph(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(GRAPH_PHOTO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 404 || !response.ok) return null;

      const blob = await response.blob();
      return this.toSrc(blob);
    } catch {
      return null;
    }
  }

  private async toSrc(blob: Blob | null | undefined): Promise<string | null> {
    if (!blob || !isProbablyImageBlob(blob)) return null;
    const typed = blob.type?.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' });
    return blobToDataUrl(typed);
  }
}
