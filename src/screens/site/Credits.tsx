import React from 'react';
import { SitePage } from './SitePage';
import { sourcedCitations } from './credits-data';

export const Credits: React.FC = React.memo(() => {
  const citations = sourcedCitations();
  return (
    <SitePage
      eyebrow="Credits"
      title="Credits and sources"
      lede={<>Every claim in the game traces back to a <em className="site-page-gold">public source</em>. Here they all are.</>}
    >
      <h2>Question sources</h2>
      <p>
        Every claim the game asks you to call true or false cites at least one of the public
        sources below, pulled straight from the game's own question data.
      </p>
      <ul className="site-page-citation-list">
        {citations.map((citation) => (
          <li key={citation.id}>
            {citation.url ? <a href={citation.url}>{citation.shortDisplayLine}</a> : citation.shortDisplayLine}
            {(citation.accessedDate || citation.lastVerified) && (
              <span className="site-page-citation-date"> (accessed {citation.accessedDate ?? citation.lastVerified})</span>
            )}
          </li>
        ))}
      </ul>

      <h2>Music</h2>
      <p>The game's background music is generated with ElevenLabs, under its subscription license.</p>

      <h2>Type</h2>
      <p>Set in IBM Plex Sans and IBM Plex Mono, licensed under the SIL Open Font License.</p>

      <h2>Icons</h2>
      <p>Icons come from Lucide.</p>
    </SitePage>
  );
});

Credits.displayName = 'Credits';

export default Credits;
