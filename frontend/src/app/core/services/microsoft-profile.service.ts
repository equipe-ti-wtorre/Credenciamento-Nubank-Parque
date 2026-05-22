import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

const GRAPH_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photo/$value';

@Injectable({ providedIn: 'root' })
export class MicrosoftProfileService {
  constructor(private api: ApiService) {}

  /** Foto via backend (User.Read.All + client secret do tenant). */
  async fetchPhotoObjectUrlFromApi(): Promise<string | null> {
    try {
      const blob = await firstValueFrom(this.api.getBlob('/auth/profile-photo'));
      if (!blob?.size) return null;
      const imageBlob = this.normalizeImageBlob(blob);
      return URL.createObjectURL(imageBlob);
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
      if (!blob?.size) return null;
      return URL.createObjectURL(this.normalizeImageBlob(blob));
    } catch {
      return null;
    }
  }

  private normalizeImageBlob(blob: Blob): Blob {
    if (blob.type && blob.type.startsWith('image/')) return blob;
    return new Blob([blob], { type: 'image/jpeg' });
  }
}
