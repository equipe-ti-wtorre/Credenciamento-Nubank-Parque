import { from, Observable, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export function isProbablyImageBlob(blob: Blob): boolean {
  if (!blob?.size) return false;
  const type = (blob.type || '').toLowerCase();
  if (!type) return true;
  if (type.startsWith('image/')) return true;
  if (type === 'application/octet-stream') return true;
  return false;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  const typed = blob.type?.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(typed);
  });
}

/** Converte o blob da API em data URL (exibível em <img>, inclusive sem Zone.js). */
export function blobToImageSrc(blob: Blob): Observable<string> {
  if (!isProbablyImageBlob(blob)) {
    return throwError(() => new Error('Resposta não é uma imagem.'));
  }
  return from(blobToDataUrl(blob));
}

export function withImageSrc(blob$: Observable<Blob>): Observable<string> {
  return blob$.pipe(switchMap(blobToImageSrc));
}
