import React from 'react';
import { SitePage } from './SitePage';

export const About: React.FC = React.memo(() => (
  <SitePage
    eyebrow="About"
    title="What Vax or Fiction is"
    lede={<>A room game about vaccine myths and facts, where <em className="site-page-gold">conviction beats speed</em>.</>}
  >
    <p>
      Vax or Fiction is played on a big screen with everyone's phones. The host puts up a claim
      about vaccines, the room calls it true or false, and the room finds out together whether it
      held up. Fast guesses do not win. A confident, correct call does.
    </p>
    <p>
      A session runs like a game show. The host opens a lobby, the room joins with a four-character
      code, and the game moves through a run of claims drawn from public health sources, including
      the CDC, ACIP, the FDA and the WHO. Each round shows the real evidence behind the answer, so
      the takeaway sticks after the screen goes dark.
    </p>
    <p>
      It works as a party, a team huddle, an in-service, or a solo round for one player who wants
      to test their own instincts. The room's collective read is usually better than any one
      guess, which is most of the point.
    </p>
    <p>Vax or Fiction was made by a pharmacist.</p>
  </SitePage>
));

About.displayName = 'About';

export default About;
