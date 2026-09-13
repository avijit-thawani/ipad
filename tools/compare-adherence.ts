/**
 * Render one sketch at every adherence level, on a single model, so the five
 * clauses in `shared/prompts.ts` can be judged against each other rather than
 * guessed at.
 *
 *   node tools/compare-adherence.ts --yes
 *   node tools/compare-adherence.ts --yes --model openai/gpt-image-2 --style ink
 *
 * Holds everything else constant: same sketch, same model, same style, same
 * effort, same aspect. Spends real money, one image per level, so it refuses
 * to run without --yes.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_MODEL_ID, effortParams, findModel, nearestAspect } from '../shared/models.ts';
import { ADHERENCE, buildPrompt, findStyle } from '../shared/prompts.ts';

const RENDERS = 'renders';

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

async function apiKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile('.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='));
  const value = line?.slice('OPENROUTER_API_KEY='.length).trim();
  if (!value) throw new Error('OPENROUTER_API_KEY is not set in the environment or .env');
  return value;
}

function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b.readUInt16BE(0) === 0xffd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const m = b[o + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        return { height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) };
      }
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
  return null;
}

function extensionFor(bytes: Buffer): string {
  if (bytes.readUInt32BE(0) === 0x89504e47) return 'png';
  if (bytes.readUInt16BE(0) === 0xffd8) return 'jpg';
  return 'bin';
}

async function main() {
  const model = findModel(arg('--model', DEFAULT_MODEL_ID));
  if (!model) throw new Error(`unknown model: ${arg('--model', DEFAULT_MODEL_ID)}`);
  const style = findStyle(arg('--style', 'none'));
  if (!style) throw new Error(`unknown style: ${arg('--style', 'none')}`);
  const typed = arg('--prompt', '');

  if (!process.argv.includes('--yes')) {
    console.log(
      `This renders ${ADHERENCE.length} images on ${model.label}, about ` +
        `$${(model.measuredUsd * ADHERENCE.length).toFixed(2)}.\n` +
        'Re-run with --yes to go ahead.'
    );
    process.exit(1);
  }

  const sketches = (await readdir(RENDERS)).filter((f) => f.endsWith('-sketch.png')).sort();
  const sketchPath = join(RENDERS, sketches.at(-1)!);
  const sketch = await readFile(sketchPath);
  const size = imageSize(sketch);
  if (!size) throw new Error(`cannot read ${sketchPath}`);
  const dataUrl = `data:image/png;base64,${sketch.toString('base64')}`;
  const aspect = nearestAspect(model, size.width, size.height);

  const outDir = join(RENDERS, `adherence-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(outDir, { recursive: true });

  console.log(`sketch ${sketchPath} (${size.width}x${size.height}, ${aspect})`);
  console.log(`model  ${model.label}   style ${style.label}   effort 0`);
  console.log(`out    ${outDir}\n`);

  const key = await apiKey();

  const rows = await Promise.all(
    ADHERENCE.map(async (adherence) => {
      const prompt = buildPrompt({ adherence, style, typed });
      const started = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/images', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'X-Title': 'Sketch adherence sweep',
          },
          body: JSON.stringify({
            model: model.id,
            prompt,
            input_references: [{ type: 'image_url', image_url: { url: dataUrl } }],
            aspect_ratio: aspect,
            ...effortParams(model, 0),
          }),
          signal: AbortSignal.timeout(180_000),
        });
        const seconds = (Date.now() - started) / 1000;
        if (!response.ok) {
          const text = await response.text();
          return { adherence, seconds, cost: null, file: `HTTP ${response.status}: ${text.slice(0, 80)}` };
        }
        const bodyJson = (await response.json()) as {
          data?: { b64_json?: string }[];
          usage?: { cost?: number };
        };
        const b64 = bodyJson.data?.[0]?.b64_json;
        if (!b64) return { adherence, seconds, cost: null, file: 'no image returned' };

        const bytes = Buffer.from(b64, 'base64');
        const file = `${adherence.level}-${adherence.label.toLowerCase()}.${extensionFor(bytes)}`;
        await writeFile(join(outDir, file), bytes);
        return {
          adherence,
          seconds,
          cost: typeof bodyJson.usage?.cost === 'number' ? bodyJson.usage.cost : null,
          file,
        };
      } catch (e) {
        return {
          adherence,
          seconds: (Date.now() - started) / 1000,
          cost: null,
          file: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : String(e),
        };
      }
    })
  );

  console.log(`${'level'.padEnd(14)}${'secs'.padStart(6)}${'cost'.padStart(10)}  file`);
  console.log('-'.repeat(64));
  for (const r of rows) {
    console.log(
      `${r.adherence.level}. ${r.adherence.label}`.padEnd(14) +
        r.seconds.toFixed(1).padStart(6) +
        (r.cost === null ? '   n/a' : `$${r.cost.toFixed(4)}`).padStart(10) +
        `  ${r.file}`
    );
  }
  console.log('-'.repeat(64));
  console.log(`billed $${rows.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(4)}`);

  await writeFile(
    join(outDir, 'results.json'),
    JSON.stringify({ sketchPath, model: model.id, style: style.id, aspect, rows }, null, 2)
  );
}

await main();
