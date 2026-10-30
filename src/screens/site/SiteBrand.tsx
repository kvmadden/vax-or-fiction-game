import React from 'react';

/**
 * A compact, one-line text lockup for the site header: no rules, no syringe glyph, sized by the
 * surface's font-size. The full game ShowWordmark is drawn for a stage title, not a 44px header
 * row, and forcing it down to header size clipped the syringe to a stray bar and pushed the "?"
 * apart at 390 and narrower.
 */
export const SiteBrand: React.FC = React.memo(() => (
  <span className="site-brand" data-site-brand aria-label="Vax or Fiction?">
    <span className="site-brand-vax">VAX</span>
    <span className="site-brand-or">or</span>
    <span className="site-brand-fiction">FICTION?</span>
  </span>
));

SiteBrand.displayName = 'SiteBrand';

export default SiteBrand;
