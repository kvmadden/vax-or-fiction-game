import React from 'react';
import { SitePage } from './SitePage';

export const Privacy: React.FC = React.memo(() => (
  <SitePage
    eyebrow="Legal"
    title="Privacy"
    lede={<>There is <em className="site-page-gold">no account and no sign-up</em>, so here is plainly what the game does keep.</>}
    updated="September 2026"
  >
    <h2>There is no account</h2>
    <p>
      You never create a login to play. Joining a room only needs a room code and a nickname you
      pick. There are no names, emails, or payment details collected from players.
    </p>
    <h2>While a room is open</h2>
    <p>
      A hosted game runs through a live relay. It stores the room code, a scrambled version of the
      host's and each phone's connection credential (not the credential itself), each phone's
      device ID, and that phone's in-game state, meaning its nickname, team, vote, and score. This
      keeps the room in sync while everyone is playing.
    </p>
    <p>
      The relay also stores the network address the room was created from, a full IPv4 address or
      the broader block an IPv6 address belongs to, for as long as that room exists. That is how
      it limits how many rooms one network can open at once.
    </p>
    <p>
      A room is not cleared on a fixed schedule. It expires 8 hours after it is created, and that
      clock resets each time the host is active. Once expired, it sits until the next time anyone
      uses the relay at all, when up to 8 expired rooms are deleted as part of that use. There is
      no separate scheduled job. Delivery records behind the scenes are capped at 128 per phone.
      Anything older than 30 minutes is cleared as the relay is used, and the rest goes when the
      room is deleted.
    </p>
    <h2>When a game ends</h2>
    <p>
      When an online room finishes, the game saves a recap, meaning the final standings with
      nicknames and scores, and how the room answered each question. It also saves a session
      summary for the game's own record, and that summary holds the same standings and nicknames.
      A solo round sends nothing anywhere. If you play with the Best pace, it keeps your best
      score for each topic and round length on your device, so a later round can compare against it.
    </p>
    <p>
      Nobody can list or read those saved recaps through the game's public connection any more.
      Only the site's single admin account can read them, and only through a signed-in,
      identity-checked request. There is no public lookup by room code or by any other key.
    </p>
    <p>
      A recap stops being readable after 30 days, and it is deleted the next time any game
      anywhere is saved after that. A session summary is deleted the first time a game is saved
      after it turns 90 days old. If no games are played, nothing triggers that deletion, so old
      rows can simply sit there until the next saved game comes along.
    </p>
    <h2>On your device</h2>
    <p>
      Your browser's <code>localStorage</code> keeps a few values, and none of them clear
      themselves automatically:
    </p>
    <ul>
      <li><code>vrc_device_id</code>, a random ID for your device, not tied to your name</li>
      <li><code>vrc_audio_muted</code>, whether you had sound muted</li>
      <li><code>{'vof-attendee-credential:<room>:<device>'}</code>, one per room you join as a phone, so a reload reconnects you as the same player</li>
      <li><code>{'vof-remote-device:<room>'}</code>, one per room you control the presenter remote from</li>
      <li><code>{'vof-solo-best:v2:<topic>:<round length>'}</code>, your best score for a topic at a given round length if you play the Best pace, so the game can tell you when you beat it</li>
      <li><code>{'vof-solo-best:<topic>'}</code>, an older best score with no round length attached. If you still have one, it is removed the next time you set a new best on that topic.</li>
    </ul>
    <p>
      A handful of other small values live only for the current browser tab (which room you are
      hosting, a remote-control pairing code, an in-progress game's state) and disappear when you
      close it.
    </p>
    <h2>What this site does not do</h2>
    <p>
      No cookies. No analytics or tracking scripts. No advertising. No error-reporting service
      watching what you do. This site was checked for all of these and none are present.
    </p>
    <h2>Hosting</h2>
    <p>
      The site and its live relay run on standard hosting providers, which keep their own
      technical request logs the way most hosts do. This page describes what the game itself
      stores. It does not speak for a hosting provider's own internal practices, which this game
      does not control.
    </p>
    <h2>What was not verified</h2>
    <p>
      A hosting provider's own log-retention practices were not independently confirmed here and
      are stated in plain words above rather than guessed.
    </p>
    <h2>Questions</h2>
    <p>
      Reach out at <a href="mailto:hello@vaxorfiction.com">hello@vaxorfiction.com</a>. This
      address is a placeholder until it is set up. See the <a href="/disclaimer">Disclaimer</a>{' '}
      for how the game's content is sourced.
    </p>
  </SitePage>
));

Privacy.displayName = 'Privacy';

export default Privacy;
