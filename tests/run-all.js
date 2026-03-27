#!/usr/bin/env node
/**
 * Beepack Test Runner
 * Runs all unit tests
 */

import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .map(f => join(__dirname, f));

console.log('🐝 Beepack Test Suite\n');
console.log(`Found ${testFiles.length} test files:\n`);
testFiles.forEach(f => console.log(`  - ${f.split('/').pop()}`));
console.log('\n' + '='.repeat(50) + '\n');

let passed = 0;
let failed = 0;

async function runTest(file) {
  return new Promise((resolve) => {
    const proc = spawn('node', ['--test', file], {
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      const filename = file.split('/').pop();
      
      if (code === 0) {
        console.log(`✅ ${filename}`);
        passed++;
      } else {
        console.log(`❌ ${filename}`);
        console.log(output);
        failed++;
      }
      
      resolve(code);
    });
  });
}

async function main() {
  for (const file of testFiles) {
    await runTest(file);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
