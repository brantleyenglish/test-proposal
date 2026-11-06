import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCockpitApp } from './app';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const port = Number(process.env.PORT ?? 3001);
const { app } = createCockpitApp({
  staticDirectory: process.env.NODE_ENV === 'production' ? resolve(import.meta.dirname, '../dist') : undefined,
});

app.listen(port, () => {
  process.stdout.write(`AI SecOps cockpit API listening on http://localhost:${port}\n`);
});
