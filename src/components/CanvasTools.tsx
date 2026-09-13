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

/**
 * Eight of tldraw's thirteen. White is invisible on a white canvas, and the
 * four "light" variants are dropped so that every entry can carry a coloured
 * disc that actually matches it — there is no pale-blue emoji, and two options
 * showing the same disc would be worse than not offering the shade.
 *
 * The disc doubles as the control's own label: collapsed, the select reads
 * "🔵 Blue", which says both what it is and what it is set to.
 */
const COLORS = [
  ['black', '⚫ Black'],
  ['grey', '⚪ Grey'],
  ['blue', '🔵 Blue'],
  ['green', '🟢 Green'],
  ['yellow', '🟡 Yellow'],
  ['orange', '🟠 Orange'],
  ['red', '🔴 Red'],
  ['violet', '🟣 Violet'],
] as const;

/** The bar glyph shows the width; the nib says which control this is. */
const SIZES = [
  ['s', '✒️ Thin ▏'],
  ['m', '✒️ Medium ▍'],
  ['l', '✒️ Thick ▊'],
  ['xl', '✒️ Heavy █'],
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => pickTool(t.id)} className={chip(tool === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

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
