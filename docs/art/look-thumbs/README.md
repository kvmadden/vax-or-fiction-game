# The look stills on the setup Look screen

`public/look-thumbs/<look>.webp` holds a still of each look's real stage, Today included, posing the show deck's q6:
"Shingles pain can continue for years after the rash disappears." It is the card the Look screen's sample shows, and the
setup cards show the stills (`src/looks/LookThumb.tsx`).

`npm run looks:thumbs` (`scripts/capture-look-thumbs.mjs`) makes them from the running app: the stage at 1600 by 900 with
the topic pattern off, and the header, the join pill and the status rail hidden, cut to 432 by 243 and saved as WebP. Make
them again after a change to a look's question stage, its picture or this card. `tests/unit/atmospheric-plates.test.ts`
fails when the card's words above no longer match the deck.
