import React from 'react';
import { SitePage } from './SitePage';

export const Terms: React.FC = React.memo(() => (
  <SitePage
    eyebrow="Legal"
    title="Terms of use"
    lede={<>Plain terms, kept <em className="site-page-gold">modest</em>, for a game about being wrong out loud.</>}
    updated="September 2026"
  >
    <h2>1. Using the game</h2>
    <p>
      By hosting or joining a game, you agree to these terms. If you do not agree, do not use the
      site.
    </p>
    <h2>2. Nicknames and conduct</h2>
    <p>
      Pick a nickname that is not offensive, impersonating someone else, or otherwise unsuitable
      for the room you are in. The game runs an automatic filter over nicknames, and a name that
      trips it is shown to the room as a neutral fallback instead. Joining never fails because of
      a nickname.
    </p>
    <h2>3. As is, no warranty</h2>
    <p>
      The game is provided as is and as available, with no warranty of any kind, express or
      implied. There is no promise the site will be uninterrupted, error-free, or available at any
      particular time.
    </p>
    <h2>4. Limits of liability</h2>
    <p>
      To the fullest extent the law allows, Vax or Fiction is not liable for indirect, incidental,
      or consequential loss arising from your use of the game. Nothing here is medical advice. See
      the <a href="/disclaimer">Disclaimer</a> for that.
    </p>
    <h2>5. Changes</h2>
    <p>
      These terms may be updated from time to time. The date above shows when they last changed.
      Continuing to use the game after an update means you accept the new terms.
    </p>
    <h2>6. Contact</h2>
    <p>
      Questions go to <a href="mailto:hello@vaxorfiction.com">hello@vaxorfiction.com</a>, a
      placeholder address until it is set up.
    </p>
  </SitePage>
));

Terms.displayName = 'Terms';

export default Terms;
