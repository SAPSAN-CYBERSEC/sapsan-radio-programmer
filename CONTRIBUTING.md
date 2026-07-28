# Contributing

Two kinds of help are worth more than anything else here.

## 1. Confirm a radio

The protocol was worked out on a Baofeng UV-82 and from CHIRP's driver. Every other model in the
list is *expected* to work, not *known* to work.

If you have one of them, run this and open an issue with the output:

```bash
node --experimental-strip-types tools/hw-test.ts
```

It only reads. Nothing is written to your radio.

Useful details in the issue: exact model, what the label says, the ident bytes printed by the
script, and your OS. If it failed, paste the error verbatim - "it did not work" tells us nothing
we can act on.

## 2. Add frequencies for your country

Right now the tool ships sets for the US, Poland, Germany and Czechia. Adding a country is mostly
data entry, and the data is the hard part.

What a usable contribution looks like:

- **A source anyone can check.** A regulator's page, a national band plan, a well-kept community
  database. Not "I copied this from my radio".
- **Exact figures.** Channel one, channel last, and the raster. That lets the rest be generated
  instead of retyped, and lets a test pin the edges.
- **Honest gaps.** If you only have half the list, say so. Half a list clearly labelled beats a
  full one where the missing half was guessed.

Frequencies that go into someone's radio are not a place for approximations. A channel next to the
right one means a radio that sits silent, and the user concludes the tool is broken.

Sets live in `src/data/bands.ts`. Follow the existing pattern: generate from a formula where there
is a raster, list explicitly where there is not, and put the source in the comment above.

## What will not be merged

- **Radio settings** (squelch, VOX, backlight, timeout and the rest). That is CHIRP's job and CHIRP
  does it better. See the README.
- **Anything that blocks the user.** We inform, we do not police. A frequency outside the radio's
  band gets a warning, never a refusal.
- **Frequencies without a source.**

## Running the checks

```bash
npm install
npm test            # 32 tests, no hardware needed
npx tsc --noEmit
npm run build
```

One gotcha that will waste your afternoon: tests run under `node --experimental-strip-types`, which
does not parse TypeScript parameter properties (`constructor(private readonly x: T) {}`). One of
those anywhere in the import graph kills the entire test file before a single test runs. Declare
fields explicitly.

## Licence

By contributing you agree your work is released under **GPL-3.0**, same as the rest.
