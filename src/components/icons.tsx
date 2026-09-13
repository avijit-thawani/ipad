/**
 * Inline SVG rather than an icon package: six icons is not worth a dependency,
 * and these have to be legible at 18px under a finger on glass.
 *
 * All are stroked, not filled, and inherit `currentColor`, so a button only has
 * to set text colour to theme them.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 18,
  height: 18,
  'aria-hidden': true,
};

/** Arrow cursor, the near-universal sign for a selection tool. */
export const SelectIcon = () => (
  <svg {...base}>
    <path d="M5 3l6.5 17 2.2-6.3 6.3-2.2z" />
  </svg>
);

/** A nib at an angle: the shape people read as "draw", not "write text". */
export const PenIcon = () => (
  <svg {...base}>
    <path d="M16.5 3.5l4 4L8 20H4v-4z" />
    <path d="M14 6l4 4" />
  </svg>
);

/** A block rubbed along a line. */
export const EraserIcon = () => (
  <svg {...base}>
    <path d="M8.5 20H20" />
    <path d="M13 4.5l6.5 6.5-7 7H7L4 15z" />
  </svg>
);

export const UndoIcon = () => (
  <svg {...base}>
    <path d="M4 9h11a4.5 4.5 0 010 9H8" />
    <path d="M8 5L4 9l4 4" />
  </svg>
);

export const RedoIcon = () => (
  <svg {...base}>
    <path d="M20 9H9a4.5 4.5 0 000 9h7" />
    <path d="M16 5l4 4-4 4" />
  </svg>
);

/** Bin, for clearing the page — distinct from the eraser, which is a tool. */
export const TrashIcon = () => (
  <svg {...base}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
