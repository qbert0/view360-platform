/**
 * server/content/parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 1: Parse raw YAML string → plain JS object.
 * Zero domain knowledge — just YAML → object.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as yaml from 'js-yaml';

export type ParseResult =
  | { ok: true;  data: unknown }
  | { ok: false; error: string };


/** Parse a YAML string into a plain JS object. Returns error on invalid YAML. */
export function parseYaml(raw: string): ParseResult {
  try {
    const data = yaml.load(raw);
    if (data === null || data === undefined) {
      return { ok: false, error: 'YAML file rỗng hoặc chỉ chứa null.' };
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'YAML root phải là object, không phải array hay scalar.' };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: `YAML parse error: ${e?.message ?? String(e)}` };
  }
}

/** Serialize a plain JS object back to YAML string. */
export function dumpYaml(data: unknown): string {
  return yaml.dump(data, { indent: 2, lineWidth: 120, quotingType: '"' });
}
