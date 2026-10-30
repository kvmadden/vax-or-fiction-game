import React from 'react';
import { SitePage } from './SitePage';

export const Disclaimer: React.FC = React.memo(() => (
  <SitePage
    eyebrow="Legal"
    title="Disclaimer"
    lede={<>Play for fun, but treat this as <em className="site-page-gold">educational only</em>, not medical advice.</>}
    updated="September 2026"
  >
    <h2>Not medical advice</h2>
    <p>
      Vax or Fiction is an educational game. Nothing shown on screen, spoken by the host, or
      printed on a phone is medical advice, and none of it is a substitute for an actual
      clinician. For real guidance on vaccines, medications, or your own health, talk to your
      pharmacist or healthcare provider.
    </p>
    <h2>Where the content comes from</h2>
    <p>
      Every claim in the game follows public sources, including the CDC, ACIP, and the FDA, as of the
      dates shown on each evidence card. Guidance changes. A claim that was accurate on its accessed
      date may no longer reflect current recommendations by the time you play. See <a href="/credits">Credits and sources</a> for the exact list.
    </p>
    <h2>No affiliation</h2>
    <p>
      Vax or Fiction is an independent project. It is not affiliated with, endorsed by, or
      speaking for the CDC, ACIP, the FDA, any vaccine manufacturer, or any employer. Any product,
      agency, or brand named in a question is used only to describe the real claim being tested.
    </p>
    <h2>Play responsibly</h2>
    <p>
      Use the game to spark a conversation, not to settle one. If a round surfaces a question you
      are not sure about, that is the invitation to go look it up somewhere authoritative, not the
      final word.
    </p>
  </SitePage>
));

Disclaimer.displayName = 'Disclaimer';

export default Disclaimer;
