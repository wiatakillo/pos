import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('front');
  private router = inject(Router);
  private routerSub?: Subscription;

  ngOnInit() {
    // Set initial favicon based on current route
    this.updateFavicon(this.router.url);

    // Listen to route changes and update favicon
    this.routerSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.updateFavicon(event.urlAfterRedirects);
        }
      });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  private updateFavicon(url: string) {
    // Customer-facing menu route uses orange favicon
    // Admin dashboard routes use blue favicon
    const isCustomerMenu = url.startsWith('/menu/');
    const faviconPath = isCustomerMenu ? '/favicon.svg' : '/favicon-admin.svg';
    
    this.setFavicon(faviconPath);
  }

  private setFavicon(path: string) {
    // Remove existing favicon links
    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    existingLinks.forEach(link => link.remove());

    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = `${path}?v=2.0.0`;
    document.head.appendChild(link);

    // Also update apple-touch-icon
    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = path;
    document.head.appendChild(appleLink);
  }
}
