import { useState } from 'react';
import { DefaultColorStyle, DefaultSizeStyle, type Editor } from 'tldraw';

/**
 * tldraw's own toolbar and style panel are hidden (see HIDDEN_UI in DrawPage)
 * and replaced by this, so the canvas is nothing but drawing surface.
 *
 * It sits outside the `Tldraw` component, so `useEditor` is unavailable and the
 * editor is driven imperatively through a prop. Selection state is mirrored in
 * React rather than read back from the editor, which is fine because this is
 * the only thing that sets it.
 *
 * Colour and width are `select` elements rather than rows of buttons: twelve
 * swatches and four sizes were most of the clutter in the bar, and a native
 * select on iPadOS opens as a full-size picker, which is a better touch target
 * than anything hand-rolled.
 */

/** Pen and eraser only. tldraw starts in `draw`, so the initial state is right. */
const TOOLS = [
  { id: 'draw', label: 'Pen' },
  { id: 'eraser', label: 'Eraser' },
] as const;

/** tldraw's palette, minus white, which is invisible on a white canvas. */
const COLORS = [
  ['black', 'Black', '#1d1d1d'],
  ['grey', 'Grey', '#9fa8b2'],
  ['blue', 'Blue', '#4263eb'],
  ['light-blue', 'Light blue', '#4dabf7'],
  ['green', 'Green', '#099268'],
  ['light-green', 'Light green', '#40c057'],
  ['yellow', 'Yellow', '#f1ac4b'],
  ['orange', 'Orange', '#e16919'],
  ['red', 'Red', '#e03131'],
  ['light-red', 'Light red', '#ff8787'],
  ['violet', 'Violet', '#ae3ec9'],
  ['light-violet', 'Light violet', '#e599f7'],
] as const;

const SIZES = [
  ['s', 'Thin'],
  ['m', 'Medium'],
  ['l', 'Thick'],
  ['xl', 'Heavy'],
] as const;

const chip = (active: boolean) =>
  `px-2.5 py-1 rounded-field text-xs font-medium border transition-colors ${
    active
      ? 'bg-base-content text-base-100 border-base-content'
      : 'bg-base-100 border-base-content/15 text-base-content/70'
  }`;

const select =
  'rounded-field bg-base-100 border-2 border-base-content/15 px-2 py-1 text-xs ' +
  'focus:border-primary/60 focus:outline-none';

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

  const swatch = COLORS.find(([id]) => id === color)?.[2] ?? '#1d1d1d';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => pickTool(t.id)} className={chip(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {/* The swatch is the only way to see the current colour at a glance,
            since a select shows its value as text. */}
        <span
          aria-hidden
          style={{ background: swatch }}
          className="w-5 h-5 rounded-full border-2 border-base-content/20 shrink-0"
        />
        <select
          value={color}
          onChange={(e) => pickColor(e.target.value)}
          aria-label="Stroke colour"
          className={select}
        >
          {COLORS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <select
        value={size}
        onChange={(e) => pickSize(e.target.value)}
        aria-label="Stroke width"
        className={select}
      >
        {SIZES.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

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
