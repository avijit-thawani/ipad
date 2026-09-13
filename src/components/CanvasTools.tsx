import { useState } from 'react';
import { DefaultColorStyle, DefaultSizeStyle, type Editor } from 'tldraw';

/**
 * tldraw's own toolbar and style panel are hidden (see HIDDEN_UI in DrawPage)
 * and replaced by this, so the canvas is nothing but drawing surface and every
 * control lives in one bar along the bottom.
 *
 * It sits outside the `Tldraw` component, so `useEditor` is unavailable and the
 * editor is driven imperatively through a ref. Selection state is mirrored in
 * React rather than read back from the editor, which is fine because this is
 * the only thing that sets it.
 */

/**
 * Pen and eraser only, deliberately. Shapes and select were clutter on a
 * surface whose whole point is freehand; tldraw still has them if they are
 * ever wanted back. `draw` is the tool tldraw starts in, so the initial
 * highlight is already correct without setting anything.
 */
const TOOLS = [
  { id: 'draw', label: 'Pen' },
  { id: 'eraser', label: 'Eraser' },
] as const;

/** tldraw's palette, minus white, which is invisible on a white canvas. */
const COLORS = [
  'black',
  'grey',
  'blue',
  'light-blue',
  'green',
  'light-green',
  'yellow',
  'orange',
  'red',
  'light-red',
  'violet',
  'light-violet',
] as const;

const SIZES = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
  { id: 'xl', label: 'XL' },
] as const;

/** Swatch fills. tldraw's palette is not exposed as plain CSS, so approximate. */
const SWATCH: Record<string, string> = {
  black: '#1d1d1d',
  grey: '#9fa8b2',
  blue: '#4263eb',
  'light-blue': '#4dabf7',
  green: '#099268',
  'light-green': '#40c057',
  yellow: '#f1ac4b',
  orange: '#e16919',
  red: '#e03131',
  'light-red': '#ff8787',
  violet: '#ae3ec9',
  'light-violet': '#e599f7',
};

export default function CanvasTools({ editor }: { editor: Editor | null }) {
  const [tool, setTool] = useState<string>('draw');
  const [color, setColor] = useState<string>('black');
  const [size, setSize] = useState<string>('m');

  function pickTool(id: string) {
    setTool(id);
    editor?.setCurrentTool(id);
  }

  function pickColor(next: string) {
    if (!editor) return;
    setColor(next);
    // Applies to the selection when there is one, so recolouring a finished
    // stroke works the same way as choosing a colour before drawing.
    editor.setStyleForNextShapes(DefaultColorStyle, next as 'black');
  }

  function pickSize(next: string) {
    if (!editor) return;
    setSize(next);
    editor.setStyleForNextShapes(DefaultSizeStyle, next as 'm');
  }

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-field text-xs font-medium border transition-colors ${
      active
        ? 'bg-base-content text-base-100 border-base-content'
        : 'bg-base-100 border-base-content/15 text-base-content/70'
    }`;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => pickTool(t.id)} className={chip(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1 items-center">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => pickColor(c)}
            aria-label={c}
            title={c}
            style={{ background: SWATCH[c] }}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${
              color === c ? 'border-base-content scale-115' : 'border-base-content/20'
            }`}
          />
        ))}
      </div>

      <div className="flex gap-1">
        {SIZES.map((s) => (
          <button key={s.id} onClick={() => pickSize(s.id)} className={chip(size === s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button onClick={() => editor?.undo()} className={chip(false)}>
          Undo
        </button>
        <button onClick={() => editor?.redo()} className={chip(false)}>
          Redo
        </button>
        <button
          onClick={() => {
            if (!editor) return;
            editor.selectAll();
            editor.deleteShapes(editor.getSelectedShapeIds());
          }}
          className={chip(false)}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
