import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

function dependencyEntry(chain: string[]): string {
  let requireFrom = createRequire(import.meta.url);
  let entry = '';
  for (const name of chain) {
    entry = requireFrom.resolve(name);
    requireFrom = createRequire(entry);
  }
  return realpathSync(entry);
}

const entries = [
  ...new Set([
    dependencyEntry([
      'eslint-config-next',
      '@next/eslint-plugin-next',
      'fast-glob',
      'micromatch',
      'braces',
    ]),
    dependencyEntry([
      'eslint-config-next',
      'eslint-import-resolver-typescript',
      'globby',
      'fast-glob',
      'micromatch',
      'braces',
    ]),
  ]),
];

// Hostile inputs run in a child with a deadline, not the test worker itself.
function probe(entry: string, operation: string, input: string, ast = false) {
  const result = spawnSync(
    process.execPath,
    [
      '--stack-size=256',
      '-e',
      `
    const braces = require(process.argv[1]);
    const operation = process.argv[2];
    let input = process.argv[3];
    if (process.argv[4] === 'ast') {
      const root = { type: 'root', nodes: [] };
      let parent = root;
      for (let i = 0; i < 2000; i++) {
        const child = { type: 'paren', nodes: [], parent };
        parent.nodes.push(child);
        parent = child;
      }
      parent.nodes.push({type: 'text', value: 'x'});
      input = root;
    }
    try {
      const options = { maxLength: Infinity, maxDepth: Infinity, rangeLimit: false };
      if (operation === 'default') braces(input, options);
      else braces[operation](input, options);
      console.log(JSON.stringify({ accepted: true }));
    } catch (error) {
      console.log(JSON.stringify({ name: error.name, code: error.code, message: error.message }));
    }
  `,
      entry,
      operation,
      input,
      ast ? 'ast' : 'string',
    ],
    {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 64 * 1024,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe.each(entries)('installed braces security patch (%s)', (entry) => {
  const braces = createRequire(import.meta.url)(entry);

  it.each(['default', 'parse', 'compile', 'expand', 'stringify'])(
    '%s rejects deep balanced, unbalanced and mixed patterns',
    (operation) => {
      const patterns = [
        '{'.repeat(2000) + 'a,b' + '}'.repeat(2000),
        '('.repeat(2000) + 'x' + ')'.repeat(2000),
        '{('.repeat(1000) + 'x' + ')}'.repeat(1000),
        '{'.repeat(2000) + 'x',
        '('.repeat(2000) + 'x',
      ];
      for (const pattern of patterns) {
        expect(pattern.length).toBeLessThan(10000);
        expect(probe(entry, operation, pattern)).toMatchObject({
          name: 'SyntaxError',
          code: 'BRACES_DEPTH_LIMIT',
        });
      }
    },
  );

  it.each(['compile', 'expand', 'stringify'])(
    '%s guards caller-supplied ASTs',
    (operation) => {
      expect(probe(entry, operation, '', true)).toMatchObject({
        name: 'SyntaxError',
        code: 'BRACES_DEPTH_LIMIT',
      });
    },
  );

  it('accepts the documented nesting boundary and rejects one level beyond', () => {
    const atLimit = '{'.repeat(128) + 'x' + '}'.repeat(128);
    expect(braces.stringify(atLimit)).toBe(atLimit);
    expect(braces.compile(atLimit)).toBe(atLimit);
    expect(braces.expand(atLimit)).toEqual([atLimit]);
    expect(() => braces.parse('{' + atLimit + '}')).toThrow('depth limit');
  });

  it('keeps common globs, ranges, escaping and literal syntax compatible', () => {
    expect(braces('src/**/*.{ts,tsx}')).toEqual(['src/**/*.(ts|tsx)']);
    expect(braces.expand('a/{b,{c,d}}')).toEqual(['a/b', 'a/c', 'a/d']);
    expect(braces.expand('file{01..03}.ts')).toEqual([
      'file01.ts',
      'file02.ts',
      'file03.ts',
    ]);
    expect(braces.expand('file{1..5..2}')).toEqual(['file1', 'file3', 'file5']);
    expect(braces.expand(String.raw`\{literal\}`)).toEqual(['{literal}']);
    expect(braces.stringify('a/{b,c')).toBe('a/{b,c');
    expect(braces.expand('${name}')).toEqual(['${name}']);
    expect(braces.stringify('"' + '{'.repeat(500) + '"')).toBe('{'.repeat(500));
    expect(braces.stringify(String.raw`\{`.repeat(500))).toBe('{'.repeat(500));
  });
});

it('ships the patch to Docker before frozen dependency installation', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const copy = dockerfile.indexOf('COPY patches ./patches');
  expect(copy).toBeGreaterThan(-1);
  expect(copy).toBeLessThan(
    dockerfile.indexOf('pnpm install --frozen-lockfile'),
  );
  expect(readFileSync('.dockerignore', 'utf8').split(/\r?\n/)).toContain(
    '.local',
  );
  expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain('braces@3.0.3');
});
