# Past generations and stroke history

<!-- One open decision per section. When one is settled, replace the argument
     with the conclusion and why, and keep it short. -->

**Status: undecided. Current behaviour is a placeholder, not a conclusion.**

Every request sends exactly one reference image — the sketch in front of you —
and no previous render, no earlier sketch, and no stroke history. See the
comment at `input_references` in [`../netlify/functions/generate.ts`](../netlify/functions/generate.ts).

## What feeding history back would buy

Consistency, which is the one thing a single sketch cannot express. A character
who looks the same across rounds, a palette that holds, a house drawn from a
second angle that is recognisably the same house. Iterating on a render rather
than restarting is the feature people actually want from a sketch tool, and the
models already support it: the Gemini family accepts up to 14 reference images,
so "attach the previous render" is a few lines in `generate.ts`.

## What it costs

- **Money, on every subsequent render.** Input images are billed, not free.
  `openai/gpt-image-2.5-*` charges $0.000008 per input image token alongside
  output, and `google/gemini-3-pro-image` bills input too. A growing history
  means each round costs more than the last, and the increase compounds
  silently — the opposite of the flat, predictable per-render price the app has
  now.
- **A cap, so it cannot simply grow.** 14 references for Gemini, fewer
  elsewhere. Any real history needs a window, a summary, or a user-chosen
  subset, and picking that policy is the actual design work — not the plumbing.
- **Path dependence.** Output stops being a function of the sketch and becomes
  a function of the sketch plus everything before it. One bad round poisons the
  next, and "start clean" turns into a control you have to build, explain, and
  remember to use. It also makes the adherence slider harder to reason about:
  faithful to the drawing, or faithful to the last render?

## Strokes are a different problem

tldraw's snapshot is much richer than any render: full stroke order with
per-point pressure, which is the closest thing to *how* you drew rather than
*what* you drew. Draw order alone would say which element is the subject and
which is background.

But no image model accepts strokes. Using them means rendering them into
something visual (frames of a build-up, a heat map of pressure) or describing
them in text for the prompt. Both are real projects, and neither is obviously
better than just looking at the finished sketch.

## Options, roughly in order of cost

1. **Nothing** (today). Flat price, no surprises, no consistency across rounds.
2. **Opt-in "continue from this"** — attach only the render you are looking at,
   only when you ask. One extra input image, a bounded cost, and path
   dependence becomes something you chose rather than something that happened.
3. **Rolling window of N renders**, auto-attached. Real consistency, growing
   cost, and needs a clear-history control.
4. **Anything stroke-derived.** Only worth it once 2 or 3 has proved that
   history helps at all.

Option 2 is the cheapest way to find out whether any of this is worth it, and
it is the one to build first if the answer matters.
