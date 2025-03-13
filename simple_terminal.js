#!/usr/bin/env node

// A super simple terminal UI that doesn't use blessed
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Clear the screen
console.clear();

// Print a simple UI
console.log('='.repeat(80));
console.log('                               SIMPLE MAXBOT UI                               ');
console.log('='.repeat(80));
console.log('\n');
console.log('This is a simplified version that should definitely exit properly.\n');
console.log('Press Enter to exit, or wait 5 seconds for automatic exit.\n');
console.log('='.repeat(80));

// Set up a timer to exit automatically
const exitTimer = setTimeout(() => {
  console.log('\nTimeout reached. Exiting automatically...');
  rl.close();
  process.exit(0);
}, 5000);

// Exit when Enter is pressed
rl.on('line', () => {
  console.log('\nEnter key pressed. Exiting...');
  clearTimeout(exitTimer);
  rl.close();
  process.exit(0);
});

// Also exit on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\nCtrl+C pressed. Exiting...');
  clearTimeout(exitTimer);
  rl.close();
  process.exit(0);
});

// Make sure we exit when readline closes
rl.on('close', () => {
  console.log('Readline closed. Exiting...');
  process.exit(0);
}); 