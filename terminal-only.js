#!/usr/bin/env node

// Clear the screen
console.clear();

console.log('='.repeat(80));
console.log('BASIC MAXBOT TERMINAL UI');
console.log('='.repeat(80));
console.log('\nThis is a basic terminal interface without blessed.');
console.log('\nThe application will exit automatically in 10 seconds.');
console.log('\nPress Ctrl+C to exit immediately.');
console.log('\n' + '='.repeat(80));

// Set up a readline interface to capture key presses
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c') {
    console.log('\nExiting on Ctrl+C');
    process.exit(0);
  }
  
  console.log(`\nKey pressed: ${key.name}`);
  if (key.name === 'return' || key.name === 'enter') {
    console.log('Exiting on Enter key');
    process.exit(0);
  }
});

// Auto-exit after 10 seconds
setTimeout(() => {
  console.log('\nAuto-exit timeout reached. Exiting...');
  process.exit(0);
}, 10000);

console.log('\nListening for key presses...'); 