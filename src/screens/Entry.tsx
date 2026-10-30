import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { ShowWordmark } from '../components/show/ShowWordmark';
import { StageCones } from '../components/show/StageCones';
import { tapUi } from '../engine/audio-cues';
import { useLandingMusicLifecycle, useLandingMusicStore } from '../engine/landing-music';

export interface EntryProps {
  onHost: () => void;
  onJoin: () => void;
  /** Solo play (VOF-44): one person, no room code, no host screen. */
  onSolo: () => void;
}

export const Entry: React.FC<EntryProps> = React.memo(({ onHost, onJoin, onSolo }) => {
  const musicPlaying = useLandingMusicStore((state) => state.playing);
  const toggleMusic = useLandingMusicStore((state) => state.toggle);
  const hardStopMusic = useLandingMusicStore((state) => state.hardStop);

  // Stops on pagehide and on unmount alike (a full host/join/solo navigation tears it down on
  // its own too, the onClick handlers below stop it a beat earlier so the beds never overlap).
  useLandingMusicLifecycle();

  return (
    <main className="entry-screen entry-screen-hero" data-screen="entry">
      <div className="entry-stage" aria-hidden="true">
        <StageCones calm />
        <div className="show-lights" />
      </div>
      <h1 className="entry-hero-art" aria-label="Vax or Fiction?">
        <ShowWordmark bandAidEgg />
      </h1>
      <section className="entry-card" aria-label="Ways to play">
        <p className="entry-kicker" data-role="entry-kicker">What's your best prediction?</p>
        <p className="entry-orientation">
          Talk it through.<br />Let the evidence surprise you.
        </p>
        <div className="entry-actions">
          <button className="entry-primary" type="button" onClick={() => { hardStopMusic(); tapUi(); onJoin(); }}>Join a game</button>
          <button className="entry-secondary" type="button" onClick={() => { hardStopMusic(); tapUi(); onHost(); }}>Host a game</button>
          <button className="entry-secondary entry-solo" type="button" onClick={() => { hardStopMusic(); tapUi(); onSolo(); }}>Play on your own</button>
        </div>
      </section>
      <nav className="entry-footer" aria-label="Site pages">
        <a href="/about" onClick={() => tapUi()}>About</a>
        <a href="/disclaimer" onClick={() => tapUi()}>Disclaimer</a>
        <a href="/privacy" onClick={() => tapUi()}>Privacy</a>
        <a href="/terms" onClick={() => tapUi()}>Terms</a>
        <a href="/credits" onClick={() => tapUi()}>Credits</a>
      </nav>
      {/* After the footer nav in DOM order (position is fixed, so it does not move on screen)
          so it is not the first tab stop ahead of the three primary actions. */}
      <button
        type="button"
        className={`entry-audio-toggle${musicPlaying ? ' is-playing' : ''}`}
        aria-pressed={musicPlaying}
        aria-label="Music"
        title={musicPlaying ? 'Music on' : 'Music off'}
        onClick={toggleMusic}
        data-role="entry-audio-toggle"
      >
        {musicPlaying ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      </button>
    </main>
  );
});

Entry.displayName = 'Entry';

export default Entry;
