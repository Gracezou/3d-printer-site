import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import postgres from 'postgres';

const DEFAULT_SAMPLES = 100;
const DEFAULT_WARMUP = 5;

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readPositiveInteger(name, fallback) {
  const value = Number(readOption(name, fallback));
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error(`--${name} must be an integer between 1 and 10000`);
  }
  return value;
}

function percentile(sortedValues, percentage) {
  const index = Math.max(
    0,
    Math.min(
      sortedValues.length - 1,
      Math.ceil((percentage / 100) * sortedValues.length) - 1,
    ),
  );
  return sortedValues[index];
}

function summarize(values, attempted, failures) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      attempted,
      succeeded: 0,
      failed: failures,
      successRate: 0,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
    };
  }
  return {
    attempted,
    succeeded: sorted.length,
    failed: failures,
    successRate: Number(((sorted.length / attempted) * 100).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    p50Ms: Number(percentile(sorted, 50).toFixed(2)),
    p95Ms: Number(percentile(sorted, 95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 99).toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2)),
  };
}

function clientOptions() {
  return {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    max_lifetime: 60,
    connection: { statement_timeout: 10_000 },
  };
}

async function measureCold(databaseUrl, samples) {
  const values = [];
  const errors = {};
  for (let index = 0; index < samples; index += 1) {
    const sql = postgres(databaseUrl, clientOptions());
    const start = performance.now();
    try {
      await sql`SELECT 1`;
      values.push(performance.now() - start);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'UNKNOWN';
      errors[code] = (errors[code] ?? 0) + 1;
    } finally {
      await sql.end({ timeout: 2 }).catch(() => undefined);
    }
  }
  const failures = samples - values.length;
  return {
    samplesMs: values,
    errors,
    summary: summarize(values, samples, failures),
  };
}

async function measureHot(databaseUrl, samples, warmup) {
  const values = [];
  const errors = {};
  const sql = postgres(databaseUrl, clientOptions());
  try {
    for (let index = 0; index < warmup; index += 1) {
      await sql`SELECT 1`;
    }
    for (let index = 0; index < samples; index += 1) {
      const start = performance.now();
      try {
        await sql`SELECT 1`;
        values.push(performance.now() - start);
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : 'UNKNOWN';
        errors[code] = (errors[code] ?? 0) + 1;
      }
    }
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
  const failures = samples - values.length;
  return {
    samplesMs: values,
    errors,
    summary: summarize(values, samples, failures),
  };
}

function defaultPeriod() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const parsedUrl = new URL(databaseUrl);
  const port = parsedUrl.port || '5432';
  if (port !== '6543') {
    throw new Error(
      `Refusing measurement: expected Supavisor port 6543, got ${port}`,
    );
  }

  const samples = readPositiveInteger('samples', DEFAULT_SAMPLES);
  const warmup = readPositiveInteger('warmup', DEFAULT_WARMUP);
  const location = readOption('location', 'unknown');
  const period = readOption('period', defaultPeriod());
  const output = readOption('output', undefined);
  const startedAt = new Date().toISOString();

  process.stdout.write(
    `Measuring ${samples} cold and ${samples} hot SELECT 1 samples (${location}/${period}, Supavisor 6543).\n`,
  );
  const cold = await measureCold(databaseUrl, samples);
  const hot = await measureHot(databaseUrl, samples, warmup);
  const result = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    location,
    period,
    connection: { provider: 'Supavisor', mode: 'transaction', port: 6543 },
    query: 'SELECT 1',
    samplesPerMode: samples,
    warmup,
    cold,
    hot,
  };

  process.stdout.write(`cold=${JSON.stringify(cold.summary)}\n`);
  process.stdout.write(`hot=${JSON.stringify(hot.summary)}\n`);
  if (output) {
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write(`result=${output}\n`);
  }
  if (cold.summary.succeeded !== samples || hot.summary.succeeded !== samples) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Database latency measurement failed: ${message}\n`);
  process.exitCode = 1;
});
