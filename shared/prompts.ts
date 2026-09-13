/**
 * Every word this app ever sends to a model. Nothing prompt-shaped lives
 * anywhere else — if output is disappointing, this is the only file to read.
 *
 * The final prompt is assembled by `buildPrompt` as four ordered parts:
 *
 *   1. PREAMBLE      what the input is
 *   2. adherence      how literally to take it
 *   3. your text      what it should become
 *   4. style          how it should be rendered
 *
 * None of this is an API parameter. No image model exposes a knob for
 * "interpret loosely" or "draw it as ink", and `input_references` is
 * all-or-nothing, so prompt text is the only lever — which is also why both
 * axes work identically on every model, unlike effort.
 */

/**
 * Says what the input *is*. Without it, models reproduce the wobbly pencil
 * lines faithfully — cleaning the sketch up rather than realising it, which
 * is the difference between sketch-to-image and sketch-cleanup.
 *
 * Deliberately silent on how closely to follow the drawing. That used to be
 * hardcoded here as "keep the arrangement, proportions and placement", which
 * pinned every render near maximum adherence and would now contradict the
 * looser settings. ADHERENCE is the only voice on that.
 */
export const PREAMBLE =
  'The reference image is a rough hand-drawn sketch. Render it as a finished ' +
  'image rather than copying the pencil strokes, and ignore stray marks.';

/** Used when you typed nothing and picked no style, so something must be said. */
export const FALLBACK_PROMPT =
  'Render the sketch as a detailed, well-lit illustration, choosing a style ' +
  'that suits the subject.';

/**
 * How literally to take the drawing, from reinterpretation to transcription.
 *
 * Five hand-written variants rather than a numeric scale interpolated into one
 * sentence: a bare "3 out of 10" does not steer a model reliably, and the
 * interesting differences are not quantitative anyway. Each variant names the
 * specific things that may or may not drift — relative position, proportion,
 * orientation, expression, colour, and whether anything may be added — because
 * those are what you actually notice in the output.
 */
export type AdherenceSpec = {
  /** 1 is the most interpretive, 5 the most literal. */
  level: number;
  label: string;
  clause: string;
};

export const ADHERENCE: AdherenceSpec[] = [
  {
    level: 1,
    label: 'Interpret',
    clause:
      'Take the sketch as a suggestion of subject and mood, not as a layout. ' +
      'Recompose it however serves the image best: move things, change their ' +
      'number and scale, choose your own colours and expressions, and invent ' +
      'whatever surroundings and detail are missing.',
  },
  {
    level: 2,
    label: 'Loose',
    clause:
      'Keep the subject and the general sense of the scene, but treat the ' +
      'drawing loosely. You may shift where things sit relative to each other, ' +
      'adjust their proportions, pick your own colours and expressions, and ' +
      'add detail that was never drawn.',
  },
  {
    level: 3,
    label: 'Balanced',
    clause:
      'Keep every drawn element and its position relative to the others. ' +
      'Proportions, orientation, colour, expression and fine detail are yours ' +
      'to decide, and you may fill in a background that was left blank.',
  },
  {
    level: 4,
    label: 'Faithful',
    clause:
      'Follow the drawing closely: same elements, same relative positions, ' +
      'same proportions and orientation, and the same expressions or gestures ' +
      'where any are drawn. Use the colours indicated where the sketch shows ' +
      'them. Add nothing that is not there and leave nothing out.',
  },
  {
    level: 5,
    label: 'Literal',
    clause:
      'Transcribe the drawing exactly. Every element keeps its relative ' +
      'position, size, orientation, expression and colour precisely as drawn, ' +
      'including the awkward or implausible ones — where the sketch is crude, ' +
      'render that same crude form faithfully instead of substituting ' +
      'something more likely. Add nothing, omit nothing, move nothing.',
  },
];

export const DEFAULT_ADHERENCE = 4;

export function findAdherence(level: number): AdherenceSpec | undefined {
  return ADHERENCE.find((a) => a.level === level);
}

/**
 * How the image should be rendered, kept orthogonal to adherence: a style
 * speaks only to medium and finish, never to how closely to follow the layout.
 */
export type StyleSpec = { id: string; label: string; clause: string };

export const STYLES: StyleSpec[] = [
  { id: 'none', label: 'Free', clause: '' },
  {
    id: 'ink',
    label: 'Ink',
    clause: 'Render as a clean black ink line drawing with confident linework and no colour.',
  },
  {
    id: 'watercolour',
    label: 'Watercolour',
    clause:
      'Render as a loose watercolour painting with visible paper texture and soft bleeding edges.',
  },
  {
    id: 'photo',
    label: 'Photo',
    clause:
      'Render as a photograph with natural lighting, real materials and shallow depth of field.',
  },
  {
    id: 'render3d',
    label: '3D',
    clause:
      'Render as a polished 3D render with soft studio lighting, subtle shadows and matte materials.',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    clause:
      'Render as a technical blueprint: white line work on blue, annotated, orthographic, precise.',
  },
  {
    id: 'storybook',
    label: 'Storybook',
    clause:
      'Render as a warm children\u2019s storybook illustration with flat gouache shapes and gentle colour.',
  },
];

export function findStyle(id: string): StyleSpec | undefined {
  return STYLES.find((s) => s.id === id);
}

/**
 * Assemble the whole thing. Each part is terminated before joining, because a
 * typed fragment like "a hilltop cottage" otherwise runs into the clause
 * beside it and reads as a continuation of that sentence.
 */
export function buildPrompt(parts: {
  adherence: AdherenceSpec;
  style: StyleSpec;
  typed: string;
}): string {
  const typed = parts.typed.trim();
  const body = [
    parts.adherence.clause,
    typed || (parts.style.clause ? '' : FALLBACK_PROMPT),
    parts.style.clause,
  ]
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(' ');

  return `${PREAMBLE}\n\n${body || FALLBACK_PROMPT}`;
}
