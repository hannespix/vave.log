import { parseCapacityGrid, PlanParseError, type ParsedPlan } from '../shared/capacity-import';
import { assertPlanFileSize, gridFromText, readXlsx, XlsxError } from '../shared/xlsx-read';

export interface ImportRequest { input: File | string; year: number }
export type ImportResponse = { ok: true; plan: ParsedPlan; name: string } | { ok: false; message: string };

async function parse({ input, year }: ImportRequest): Promise<ImportResponse> {
  if (typeof input === 'string') {
    return { ok: true, plan: parseCapacityGrid(gridFromText(input), { year }), name: '' };
  }
  assertPlanFileSize(input.size);
  if (/\.(csv|tsv|txt)$/i.test(input.name)) {
    const text = await input.text();
    const plan = parseCapacityGrid(gridFromText(text, text.includes('\t') ? '\t' : ';'), { year });
    return { ok: true, plan, name: input.name };
  }
  const sheets = await readXlsx(await input.arrayBuffer());
  let firstError: unknown;
  for (const sheet of sheets) {
    try {
      const plan = parseCapacityGrid(sheet.rows, { merges: sheet.merges, year });
      return { ok: true, plan, name: sheets.length > 1 ? `${input.name} · ${sheet.name}` : input.name };
    } catch (error) { firstError ??= error; }
  }
  throw firstError;
}

const worker = self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<ImportRequest>) => void) => void;
  postMessage: (message: ImportResponse) => void;
};
function reply(result: ImportResponse) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker messages have no target origin.
  worker.postMessage(result);
}
worker.addEventListener('message', ({ data }) => {
  void parse(data).then(reply).catch((error: unknown) => {
    const message = error instanceof PlanParseError || error instanceof XlsxError ? error.message : 'Die Tabelle konnte nicht gelesen werden.';
    reply({ ok: false, message });
  });
});
