#!/usr/bin/env node

import { runCLI } from './cli/index.js';

runCLI().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
