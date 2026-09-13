/**
 * Render one sketch through every model in the catalog, in parallel, and print
 * what each cost and how long it took.
 *
 * This exists because OpenRouter publishes no latency figures for image models
 * and its prices are per-token for most of them, so the only way to choose a
 * default is to measure. Run it once, look at the grid, set IMAGE_MODEL.
 *
 *   node tools/compare-models.ts --yes                 # newest sketch in renders/
 *   node tools/compare-models.ts --yes path/to.png     # a specific one
 *   node tools/compare-models.ts --yes --effort 2
 *
 * It spends real money — one image per model — so it refuses to run without
 * --yes and prints the estimated bill first.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MODELS, effortParams, nearestAspect, type EffortLevel } from '../shared/models.ts';

const RENDERS = 'renders';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Read OPENROUTER_API_KEY out of .env without ever printing it. */
async function apiKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile('.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='));
  const value = line?.slice('OPENROUTER_API_KEY='.length).trim();
  if (!value) throw new Error('OPENROUTER_API_KEY is not set in the environment or .env');
  return value;
}

/**
 * Dimensions without an image library. Format matters: three of the eight
 * models return JPEG rather than PNG, and reading a JPEG as though it had an
 * IHDR chunk yields garbage like 65536x4293722192.
 */
function imageSize(buffer: Buffer): { width: number; height: number } | null {
  const isPng = buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47;
  if (isPng) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };

  // JPEG: walk the segment markers to the start-of-frame, which carries the size.
  if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0..SOF3 and SOF5..SOF15, excluding the non-frame markers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/** The file extension the bytes actually deserve. */
function extensionFor(mediaType: string | undefined, buffer: Buffer): string {
  const size = imageSize(buffer);
  if (buffer.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buffer.readUInt16BE(0) === 0xffd8) return 'jpg';
  if (mediaType?.includes('webp')) return 'webp';
  if (mediaType?.includes('svg')) return 'svg';
  return size ? 'png' : 'bin';
}

async function newestSketch(): Promise<string> {
  const files = (await readdir(RENDERS)).filter((f) => f.endsWith('-sketch.png')).sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`no *-sketch.png in ${RENDERS}/ — draw something first`);
  return join(RENDERS, latest);
}

type Row = {
  label: string;
  id: string;
  ok: boolean;
  seconds: number;
  cost: number | null;
  detail: string;
  size: string;
};

async function main() {
  if (!process.argv.includes('--yes')) {
    const estimate = MODELS.reduce((sum, m) => sum + m.priceUsd, 0);
    console.log(
      `This calls ${MODELS.length} models once each, costing roughly $${estimate.toFixed(2)}.\n` +
        'Re-run with --yes to go ahead.'
    );
    process.exit(1);
  }

  const effort = Number(arg('--effort') ?? 0) as EffortLevel;
  const sketchPath = process.argv.find((a) => a.endsWith('.png')) ?? (await newestSketch());

  const sketch = await readFile(sketchPath);
  const sketchSize = imageSize(sketch);
  if (!sketchSize) throw new Error(`could not read the dimensions of ${sketchPath}`);
  const { width, height } = sketchSize;
  const dataUrl = `data:image/png;base64,${sketch.toString('base64')}`;

  // Reuse the prompt that produced this sketch, so the comparison is of models
  // and nothing else.
  const promptPath = sketchPath.replace('-sketch.png', '-prompt.txt');
  const prompt = await readFile(promptPath, 'utf8').catch(() => {
    throw new Error(`no prompt beside the sketch at ${promptPath}`);
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(RENDERS, `compare-${stamp}`);
  await mkdir(outDir, { recursive: true });

  console.log(`sketch  ${sketchPath} (${width}x${height})`);
  console.log(`effort  level ${effort}`);
  console.log(`out     ${outDir}\n`);

  const key = await apiKey();

  const rows = await Promise.all(
    MODELS.map(async (model): Promise<Row> => {
      const aspect = nearestAspect(model, width, height);
      const started = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/images', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'X-Title': 'Sketch model comparison',
          },
          body: JSON.stringify({
            model: model.id,
            prompt,
            input_references: [{ type: 'image_url', image_url: { url: dataUrl } }],
            aspect_ratio: aspect,
            ...effortParams(model, effort),
          }),
          // Generous on purpose: part of the point is to find out which models
          // are too slow for Netlify's 60s ceiling.
          signal: AbortSignal.timeout(180_000),
        });
        const seconds = (Date.now() - started) / 1000;

        if (!response.ok) {
          const text = await response.text();
          return {
            label: model.label,
            id: model.id,
            ok: false,
            seconds,
            cost: null,
            detail: `HTTP ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 90)}`,
            size: '-',
          };
        }

        const body = (await response.json()) as {
          data?: { b64_json?: string; media_type?: string }[];
          usage?: { cost?: number };
        };
        const b64 = body.data?.[0]?.b64_json;
        if (!b64) {
          return { label: model.label, id: model.id, ok: false, seconds, cost: null, detail: 'no image in response', size: '-' };
        }

        const bytes = Buffer.from(b64, 'base64');
        const mediaType = body.data?.[0]?.media_type;
        const name = `${model.id.replace(/\//g, '_')}.${extensionFor(mediaType, bytes)}`;
        await writeFile(join(outDir, name), bytes);
        const out = imageSize(bytes);

        return {
          label: model.label,
          id: model.id,
          ok: true,
          seconds,
          cost: typeof body.usage?.cost === 'number' ? body.usage.cost : null,
          detail: name,
          size: out ? `${out.width}x${out.height}` : 'unknown',
        };
      } catch (e) {
        return {
          label: model.label,
          id: model.id,
          ok: false,
          seconds: (Date.now() - started) / 1000,
          cost: null,
          detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 90) : String(e),
          size: '-',
        };
      }
    })
  );

  rows.sort((a, b) => Number(b.ok) - Number(a.ok) || a.seconds - b.seconds);

  console.log(
    `${'model'.padEnd(24)}${'secs'.padStart(7)}${'cost'.padStart(9)}${'  size'.padEnd(12)}  note`
  );
  console.log('-'.repeat(96));
  for (const r of rows) {
    console.log(
      r.label.padEnd(24) +
        r.seconds.toFixed(1).padStart(7) +
        (r.cost === null ? '     n/a' : `$${r.cost.toFixed(4)}`).padStart(9) +
        `  ${r.size}`.padEnd(12) +
        `  ${r.ok ? 'ok' : r.detail}`
    );
  }

  const spent = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const over60 = rows.filter((r) => r.ok && r.seconds > 60).map((r) => r.label);
  console.log('-'.repeat(96));
  console.log(`billed $${spent.toFixed(4)} across ${rows.filter((r) => r.ok).length} renders`);
  if (over60.length) {
    console.log(`too slow for Netlify's 60s ceiling: ${over60.join(', ')}`);
  }
  await writeFile(join(outDir, 'results.json'), JSON.stringify({ sketchPath, effort, prompt, rows }, null, 2));
}

await main();
