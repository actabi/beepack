#!/usr/bin/env node

/**
 * Packbee CLI
 * The API registry for vibe-coders
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createRequire } from 'module';
import { search, list, info, install, init, publish, login, whoami } from '../src/commands.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

// ASCII Art Logo
const logo = `
${chalk.yellow('   ____          _      _   _ _')}
${chalk.yellow('  / ___|___   __| | ___| | | (_)_   _____')}
${chalk.yellow(' | |   / _ \\ / _\` |/ _ \\ |_| | \\ \\ / / _ \\')}
${chalk.yellow(' | |__| (_) | (_| |  __/  _  | |\\ V /  __/')}
${chalk.yellow('  \\____\\___/ \\__,_|\\___|_| |_|_| \\_/ \\___|')}
${chalk.gray('  🐝 The API registry for vibe-coders')}
`;

program
  .name('packbee')
  .description('CLI for Packbee - The API registry for vibe-coders')
  .version(pkg.version)
  .addHelpText('before', logo);

// Search command
program
  .command('search <query>')
  .description('Search for packages')
  .option('-c, --capabilities <caps>', 'Filter by capabilities (comma-separated)')
  .option('--compatible <runtime>', 'Filter by runtime (cursor, copilot, claude)')
  .option('-n, --limit <number>', 'Max results', '10')
  .action(search);

// List command
program
  .command('list')
  .alias('ls')
  .description('List popular packages')
  .option('-s, --sort <field>', 'Sort by: stars, downloads, updated', 'stars')
  .option('-n, --limit <number>', 'Max results', '10')
  .action(list);

// Info command
program
  .command('info <package>')
  .description('Get detailed info about a package')
  .action(info);

// Install command
program
  .command('install <package>')
  .alias('i')
  .description('Install a package')
  .option('-v, --version <version>', 'Specific version')
  .option('-d, --dir <directory>', 'Install directory', './packages')
  .action(install);

// Init command
program
  .command('init')
  .description('Initialize a new HIVE.yaml')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .action(init);

// Publish command
program
  .command('publish')
  .description('Publish your package to Packbee')
  .option('--dry-run', 'Validate without publishing')
  .action(publish);

// Login command
program
  .command('login')
  .description('Login with GitHub')
  .option('-t, --token <token>', 'Provide token directly')
  .action(login);

// Whoami command
program
  .command('whoami')
  .description('Show current logged-in user')
  .action(whoami);

// MCP Server command
program
  .command('mcp-server')
  .description('Start MCP server for AI assistants')
  .action(async () => {
    const { startMCPServer } = await import('../src/mcp-server.js');
    await startMCPServer();
  });

// Parse and run
program.parse();
