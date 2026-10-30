# Generated art

The game has two sets of AI-generated pictures, both made with Gemini image generation on 2026-10-01 and 2026-10-02.
The folders they ship from, `public/look-art/` and `public/pattern-art/`, are served at public URLs, so they hold the
pictures and nothing else. These notes live here instead.

## Look backdrops

The six pictures in `public/look-art/` are the big-screen and phone backdrops of the three drawn looks (Studio set,
Case file, 70s game show). The default look, Today, has none. Each prompt asked for no people, no text, no logos and no
medical objects, and for a calm, dark centre where large white text can sit. See `look-backdrops/README.md`.

## Pattern tiles

The fourteen tiles in `public/pattern-art/` are engravings, one per topic family of the soft patterns behind the
questions (`src/looks/patterns/families.ts`). Each was checked for ink touching its edges, so it repeats without a seam,
then turned into a mask with ImageMagick: grayscale, negated, levels 8 to 80 percent, the white background shaped into
the alpha channel, saved as lossless WebP. The game draws each mask in one ink per look. See `pattern-tiles/README.md`.

## Look stills

`public/look-thumbs/` holds screenshots of the real stage in each look, made by `npm run looks:thumbs`. See
`look-thumbs/README.md`.
