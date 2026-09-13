# Past generations and stroke history

<!-- One open decision per section. When one is settled, replace the argument
     with the conclusion and why, and keep it short. -->

**Status: option 2 built — opt-in, off by default.** Strokes remain undecided.

The History toggle, above the render pane, turns the pane into a transcript and
sends every *visible* message with the next render. Off, exactly one reference
goes up — the sketch in front of you — which is what the app did before.

Each message has a hide control. Hidden messages stay on screen but drop out of
the request, so the transcript is where you choose what the model sees, and the
choice survives a reload. That is what makes path dependence (below) navigable
rather than something that just happens to you.

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

1. **Nothing.** Flat price, no surprises, no consistency across rounds. This is
   still what you get with the toggle off, and it is the default.
2. **Opt-in, per-message** — *built*. You choose what goes, message by message.
3. **Rolling window of N renders**, auto-attached. Not built: option 2 already
   gives this if you simply leave everything visible, without taking the choice
   away.
4. **Anything stroke-derived.** Still open, and still blocked on the same
   problem: no image model accepts strokes.

## How it is bounded

- **References are downscaled to 768px JPEG** before being sent. Netlify caps a
  buffered request at 6MB, and full-size history would blow that after three or
  four rounds. At the largest cap this lands around 2.8MB.
- **The cap is the model's own**, from its `input_references` descriptor: 16 for
  the GPT Image family, 14 for Gemini, 8 for FLUX. The current sketch takes one
  slot, so the history budget is that minus one, and when there is more history
  than budget the *newest* is kept.
- **The count is displayed**, next to the toggle, because "history on" hides how
  many images you are paying for.
