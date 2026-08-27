import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const OPERATOR_PERMISSIONS = [
  'dashboard:view',
  'order:view',
  'order:ship',
  'order:remark',
  'production:view',
  'production:update',
  'product:view',
  'product:edit',
  'category:view',
  'material:view',
  'material:stock_in',
  'user:view',
  'promotion:view',
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  let generatedPassword: string | undefined;

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO admin_roles (code, name, permissions, is_system)
        VALUES
          ('super_admin', '超级管理员', ${tx.json(['*'])}, true),
          ('operator', '运营', ${tx.json(OPERATOR_PERMISSIONS)}, true)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          permissions = EXCLUDED.permissions,
          is_system = EXCLUDED.is_system
      `;

      await tx`
        INSERT INTO shipping_rules (
          name, province_codes, first_weight_grams, first_amount,
          additional_weight_grams, additional_amount, free_threshold, sort_order
        )
        SELECT '全国默认', '[]'::jsonb, 1000, 10.00, 500, 3.00, 199.00, 999
        WHERE NOT EXISTS (SELECT 1 FROM shipping_rules WHERE name = '全国默认')
      `;

      await tx`
        INSERT INTO settings (key, value)
        VALUES
          ('order_timeout_minutes', '30'::jsonb),
          ('auto_complete_days', '15'::jsonb),
          ('site_banners', '[]'::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;

      const existingAdmin = await tx<{ id: string }[]>`
        SELECT id FROM admin_users WHERE username = 'admin' LIMIT 1
      `;

      if (existingAdmin.length === 0) {
        generatedPassword = randomBytes(18).toString('base64url');
        const passwordHash = await bcrypt.hash(generatedPassword, 12);
        await tx`
          INSERT INTO admin_users (username, password_hash, name, role_id)
          SELECT 'admin', ${passwordHash}, '系统管理员', id
          FROM admin_roles
          WHERE code = 'super_admin'
        `;
      }
    });
  } finally {
    await sql.end();
  }

  if (generatedPassword) {
    const credentialArgument = process.argv.find((argument) =>
      argument.startsWith('--credential-file='),
    );
    const credentialFile = credentialArgument?.slice(
      '--credential-file='.length,
    );

    if (credentialFile) {
      const outputPath = resolve(credentialFile);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        `username=admin\npassword=${generatedPassword}\n`,
        {
          mode: 0o600,
        },
      );
      process.stdout.write(
        `Created admin user. Credentials saved to ${credentialFile} with mode 0600.\n`,
      );
    } else {
      process.stdout.write(
        `Created admin user. Temporary password: ${generatedPassword}\n`,
      );
    }
    process.stdout.write(
      'Change this password immediately after the first login.\n',
    );
  } else {
    process.stdout.write(
      'Seed data is up to date; existing admin password was not changed.\n',
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed error';
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
