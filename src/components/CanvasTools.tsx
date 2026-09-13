import { useEffect, useState } from 'react';
import { DefaultColorStyle, DefaultSizeStyle, type Editor } from 'tldraw';
import {
  EraserIcon,
  PenIcon,
  RedoIcon,
  SelectIcon,
  TrashIcon,
  UndoIcon,
} from './icons';

/**
 * tldraw's own toolbar and style panel are hidden (see HIDDEN_UI in DrawPage)
 * and replaced by this, so the canvas is nothing but drawing surface.
 *
 * It sits outside the `Tldraw` component, so `useEditor` is unavailable and the
 * editor is driven imperatively through a prop. Selection state is mirrored in
 * React rather than read back from the editor, which is fine because this is
 * the only thing that sets it.
 */

const TOOLS = [
  { id: 'draw', label: 'Pen', Icon: PenIcon },
  { id: 'eraser', label: 'Eraser', Icon: EraserIcon },
  { id: 'select', label: 'Select', Icon: SelectIcon },
] as const;

/**
 * Eight of tldraw's thirteen. White is invisible on a white canvas, and the
 * four "light" variants are dropped so every entry can carry a disc that
 * actually matches it — there is no pale-blue emoji, and two options showing
 * the same disc would be worse than not offering the shade.
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

/**
 * Each option names its own control, so no separate "Stroke" label is needed
 * beside the select — which matters when everything shares one row. The bar
 * scales with the setting, so the width is shown and not only named.
 */
const SIZES = [
  ['s', 'Stroke S ▏'],
  ['m', 'Stroke M ▍'],
  ['l', 'Stroke L ▊'],
  ['xl', 'Stroke XL █'],
] as const;

const iconButton = (active: boolean) =>
  `p-1 rounded-field border transition-colors ${
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

  // tldraw opens in the select tool, so without this the pen looked chosen
  // while taps did nothing but select. Set explicitly rather than relying on
  // whatever tldraw's default happens to be in a given version.
  useEffect(() => {
    editor?.setCurrentTool('draw');
  }, [editor]);

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
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="flex gap-1">
        {TOOLS.map(({ id, label: name, Icon }) => (
          <button
            key={id}
            onClick={() => pickTool(id)}
            className={iconButton(tool === id)}
            title={name}
            aria-label={name}
            aria-pressed={tool === id}
          >
            <Icon />
          </button>
        ))}
      </div>

      {/* The disc in each option is the colour, so this select needs no label. */}
      <select
        value={color}
        onChange={(e) => pickColor(e.target.value)}
        aria-label="Stroke colour"
        className={select}
      >
        {COLORS.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>

      <select
        value={size}
        onChange={(e) => pickSize(e.target.value)}
        aria-label="Stroke width"
        className={select}
      >
        {SIZES.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>

      <div className="flex gap-1">
        <button onClick={() => editor?.undo()} className={iconButton(false)} title="Undo" aria-label="Undo">
          <UndoIcon />
        </button>
        <button onClick={() => editor?.redo()} className={iconButton(false)} title="Redo" aria-label="Redo">
          <RedoIcon />
        </button>
        <button
          onClick={() => {
            if (!editor) return;
            editor.selectAll();
            editor.deleteShapes(editor.getSelectedShapeIds());
          }}
          className={iconButton(false)}
          title="Clear the canvas"
          aria-label="Clear the canvas"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
