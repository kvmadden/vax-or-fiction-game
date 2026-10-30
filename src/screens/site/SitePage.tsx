import React, { type ReactNode } from 'react';
import { SiteBrand } from './SiteBrand';
import { tapUi } from '../../engine/audio-cues';
import { StageCones } from '../../components/show/StageCones';
import './site-page.css';

export const SITE_NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/about', label: 'About' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/credits', label: 'Credits' },
];

export interface SitePageProps {
  eyebrow: string;
  title: ReactNode;
  /** A short, fun lead line. Wrap the one phrase that should carry the gold underline in <em>. */
  lede: ReactNode;
  children: ReactNode;
  /** Legal pages show a last-checked stamp. About and Credits leave it out. */
  updated?: string;
}

export const SitePage: React.FC<SitePageProps> = React.memo(({ eyebrow, title, lede, children, updated }) => {
  // F-29: no current-page indicator existed in the nav. A trailing slash still counts as the
  // same route, so a link like /about matches both /about and /about/.
  const currentPath = typeof window === 'undefined' ? '' : window.location.pathname.replace(/\/$/, '') || '/';
  return (
  <div className="site-page" data-screen="site-page">
    <StageCones calm />
    <header className="site-page-nav">
      <a className="site-page-brand" href="/" onClick={() => tapUi()} aria-label="Vax or Fiction? Home">
        <SiteBrand />
      </a>
      <nav className="site-page-nav-links" aria-label="Site pages">
        {SITE_NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} aria-current={currentPath === link.href ? 'page' : undefined} onClick={() => tapUi()}>{link.label}</a>
        ))}
      </nav>
    </header>

    <main className="site-page-main">
      <div className="site-page-hero">
        <p className="site-page-eyebrow">{eyebrow}</p>
        <h1 className="site-page-title">{title}</h1>
        <p className="site-page-lede">{lede}</p>
        {updated && <p className="site-page-updated">Last checked {updated}</p>}
      </div>
      <div className="site-page-body">{children}</div>
    </main>

    <footer className="site-page-footer">
      <a className="site-page-cta" href="/" onClick={() => tapUi()}>
        <span className="site-page-cta-dot" aria-hidden="true" />
        Back to the game
      </a>
      <nav className="site-page-footer-links" aria-label="More pages">
        {SITE_NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => tapUi()}>{link.label}</a>
        ))}
      </nav>
      <p className="site-page-footer-fine">Vax or Fiction? is made by a pharmacist.</p>
    </footer>
  </div>
  );
});

SitePage.displayName = 'SitePage';

export default SitePage;
