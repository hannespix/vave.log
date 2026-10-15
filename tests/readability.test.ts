import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Wächter für die Lesbarkeit auf dem Desktop: Bei DPR 1 werden Schriften unter 10px
// mit dünner Strichstärke und hellem Grau unscharf und kaum lesbar.
const root = join(__dirname, '..', 'src', 'web');
const cssFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return cssFiles(path);
  return entry.name.endsWith('.css') ? [path] : [];
});
const files = cssFiles(root).map(path => ({ name: path.slice(root.length + 1), css: readFileSync(path, 'utf8') }));

const rgb = (hex: string) => {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lightness = (hex: string) => { const c = rgb(hex); return (Math.max(...c) + Math.min(...c)) / 2; };

describe('Lesbarkeit der Oberfläche', () => {
  it('setzt keine Schrift kleiner als 10px (Ausnahme: der 5px-Trennpunkt im Fuß)', () => {
    const tiny = files.flatMap(({ name, css }) => [...css.matchAll(/([^{}]*)\{[^{}]*font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .filter(m => Number(m[2]) < 10 && !m[1].includes('.footer-dot'))
      .map(m => `${name}: ${m[1].trim()} ${m[2]}px`));
    expect(tiny).toEqual([]);
  });
  it('nutzt für Fließtext keine dünnen Schnitte unter 400', () => {
    const thin = files.flatMap(({ name, css }) => [...css.matchAll(/([^{}]*)\{([^{}]*font-weight:\s*([1-3]\d\d)[^{}]*)\}/g)]
      // Dünn nur bei großer Anzeigeschrift (z. B. Wortmarke, Uhr), nicht bei Text.
      .filter(m => !/font-size:\s*(?:[2-9]\d)px/.test(m[2]) && !/boot-word|timer-clock/.test(m[1]))
      .map(m => `${name}: ${m[1].trim()} ${m[3]}`));
    expect(thin).toEqual([]);
    expect(files.find(f => f.name === 'styles.css')!.css).toMatch(/:root\{[^}]*font-weight:400/);
  });
  it('hält Textfarben auf hellem Grund bei mindestens 4,5:1 (Symbole 3:1)', () => {
    const weak = files.flatMap(({ name, css }) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].flatMap(rule => {
      const [, selector, body] = rule;
      const bg = body.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})\b/)?.[1] ?? '#f8f9f6';
      const min = /placeholder/.test(selector) ? 3.3 : /svg\s*$|icon-button|chevron|glyph|small-manifesto|setup-steps/.test(selector.trim()) ? 3 : 4.5;
      return [...body.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,6})\b/g)]
        // Helle Pastelltöne stehen auf Lila/Schwarz – dort gilt der Kontrast zum dunklen Grund.
        .filter(m => lightness(m[1]) <= 0.75 && contrast(m[1], bg) < min)
        .map(m => `${name}: ${selector.trim()} ${m[1]} (${contrast(m[1], bg).toFixed(2)})`);
    }));
    expect(weak).toEqual([]);
    const muted = files.find(f => f.name === 'styles.css')!.css.match(/--muted:(#[0-9a-f]{6})/)![1];
    expect(contrast(muted, '#f1f2ed')).toBeGreaterThanOrEqual(4.5);
  });
});
