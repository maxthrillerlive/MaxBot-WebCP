#!/usr/bin/env node

// Import required modules
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Create a PID file
const pidFile = path.join(__dirname, '..', 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Set up a safety timeout to force exit after 15 seconds
console.log('Setting up safety timeout (15 seconds)');
const safetyTimeout = setTimeout(() => {
  console.log('Safety timeout reached, forcing exit');
  process.exit(0);
}, 15000);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  clearTimeout(safetyTimeout);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  clearTimeout(safetyTimeout);
  process.exit(1);
});

// Clean up on exit
process.on('exit', () => {
  console.log('Exiting application');
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log('PID file removed');
    }
  } catch (e) {
    // Ignore errors
  }
});

// Log startup
console.log('Starting minimal MaxBot TUI...');

// Create a simple interval to keep the process alive
const interval = setInterval(() => {
  console.log('Application is still running...');
}, 5000);

// Set up a keyboard listener for manual exit
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (key) => {
  // Ctrl+C or q to exit
  if (key === '\u0003' || key === 'q' || key === 'Q') {
    console.log('Exit key pressed');
    clearInterval(interval);
    clearTimeout(safetyTimeout);
    process.exit(0);
  }
});

console.log('Press Ctrl+C or q to exit');
console.log('Application will automatically exit after 15 seconds'); 