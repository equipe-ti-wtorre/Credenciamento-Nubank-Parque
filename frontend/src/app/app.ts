import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { TeamsContextService } from './services/teams-context.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly teamsContext = inject(TeamsContextService);
  private readonly router = inject(Router);
  private stopDeepLinkWatch: (() => void) | null = null;
  private routerSub: Subscription | null = null;

  ngOnInit() {
    void this.authService.handleRedirect();

    const go = (path: string) => {
      const current = this.router.url.split('?')[0];
      const target = path.split('?')[0];
      if (current === target) {
        try {
          sessionStorage.removeItem(TeamsContextService.PENDING_DEEP_LINK_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (current.startsWith('/login') || current.startsWith('/auth')) return;
      void this.router.navigateByUrl(path);
    };

    void this.teamsContext.startDeepLinkWatch(go).then((stop) => {
      this.stopDeepLinkWatch = stop;
    });

    this.routerSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = (e as NavigationEnd).urlAfterRedirects.split('?')[0];
        if (/^\/(aprovacoes|acessos-servico)(\/|$)/.test(url)) {
          try {
            sessionStorage.removeItem(TeamsContextService.PENDING_DEEP_LINK_KEY);
          } catch {
            /* ignore */
          }
        }
      });
  }

  ngOnDestroy() {
    this.stopDeepLinkWatch?.();
    this.routerSub?.unsubscribe();
  }
}
