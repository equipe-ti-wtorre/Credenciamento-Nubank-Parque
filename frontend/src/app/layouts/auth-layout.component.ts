import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="min-h-screen w-full flex overflow-hidden">
      <div class="hidden lg:flex lg:min-h-screen lg:w-[58%] relative overflow-hidden">
        <div
          *ngIf="!videoOk"
          class="absolute inset-0 bg-cover bg-center bg-no-repeat"
          [style.background-image]="posterBg"
          aria-hidden="true"
        ></div>
        <video
          *ngIf="videoOk"
          class="absolute inset-0 h-full w-full object-cover"
          [src]="videoSrc"
          autoplay
          muted
          loop
          playsinline
          preload="metadata"
          [poster]="posterSrc"
          (error)="onVideoError()"
          aria-hidden="true"
        ></video>
      </div>
      <div
        class="flex-1 min-h-screen flex flex-col bg-gradient-to-b from-[#0f172a] via-[#13203a] to-[#1e3a8a] text-slate-100"
      >
        <main class="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div class="w-full max-w-md text-center">
            <router-outlet></router-outlet>
          </div>
        </main>
        <footer class="py-4 text-center text-slate-300 text-xs px-4">
          &copy; 2026 WTorre — Credenciamento
        </footer>
      </div>
    </div>
  `,
})
export class AuthLayoutComponent {
  videoOk = true;
  readonly videoSrc = 'assets/HOME-SITE.mp4';
  readonly posterSrc = 'assets/allianz_parque_fiel.png';

  get posterBg(): string {
    return `url('${this.posterSrc}')`;
  }

  onVideoError(): void {
    this.videoOk = false;
  }
}
