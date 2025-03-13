#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Starting MaxBot TUI HTTP Control...');

// Path to the HTTP control script
const controlScript = path.join(__dirname, 'server-compatible-control.js');

// Make sure the script is executable
try {
  fs.chmodSync(controlScript, '755');
} catch (err) {
  // Ignore errors
}

// Start the HTTP control server
const child = spawn('node', [controlScript], {
  stdio: 'inherit'
});

// Handle process exit
child.on('exit', (code) => {
  console.log(`HTTP control server exited with code ${code}`);
  process.exit(code);
});

// Forward signals to child process
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    child.kill(signal);
  });
});

console.log('HTTP control server started. Open http://localhost:3000 in your browser to access the control panel.'); 