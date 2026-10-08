// Creates a school administrator, the top role in Smart Learning (it manages every other account).
//
//   npm run create-admin -- --name "Jane Doe" --email jane@school.org
//   npm run create-admin -- --name "Jane Doe" --email jane@school.org --password "S0me-long-pass"
//
// Without --password a temporary one is generated and printed once; the administrator must
// replace it on first login. Creates the database and tables first if they don't exist.
const { parseArgs } = require('node:util');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { findByEmail } = require('../lib/users');
const http = require('../lib/http');

async function main() {
  const { values } = parseArgs({
    options: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } },
  });
  const name = http.text(values.name, 'name', { max: 100 });
  const email = http.email(values.email);
  const password = values.password ? auth.checkNewPassword(values.password) : auth.generateTempPassword();

  await db.init();
  const existing = await findByEmail(email);
  if (existing) {
    throw new Error(existing.role === 'admin'
      ? `${email} is already an administrator (user id ${existing.id})`
      : `${email} already has a ${existing.role} account; use another email`);
  }
  const result = await db.query('INSERT INTO users SET ?', [{
    name, email, role: 'admin',
    password_hash: await auth.hashPassword(password),
    must_change_password: values.password ? 0 : 1,
  }]);

  console.log(`Administrator created (user id ${result.insertId})`);
  console.log(`  email:    ${email}`);
  if (!values.password) console.log(`  password: ${password}   (temporary; must be changed on first login)`);
}

main()
  .catch((err) => {
    console.error('Could not create the administrator: ' + err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
