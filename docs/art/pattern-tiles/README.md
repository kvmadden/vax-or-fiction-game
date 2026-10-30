# Pattern tiles

The fourteen tiles in `public/pattern-art/` are the engravings behind the questions, one per topic family
(`src/looks/patterns/families.ts`). Each is a square lossless WebP mask: the engraving is the alpha channel, so the game
draws it in one ink per look and the file carries no colour of its own. No ink touches an edge, so a tile repeats
without a seam. Generated with Gemini image generation on 2026-10-01 and 2026-10-02, then masked with ImageMagick as
described in `docs/art/README.md`.
