#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Log function
function log(message) {
  console.log(new Date().toISOString() + ' - ' + message);
  fs.appendFileSync(path.join(__dirname, 'start-bot.log'), new Date().toISOString() + ' - ' + message + '\n');
}

try {
  log('Start bot script running...');
  
  // Path to the bot script
  const botPath = path.join(__dirname, '..', 'MaxBot', 'index.js');
  log('Bot path: ' + botPath);
  
  // Check if the file exists
  if (!fs.existsSync(botPath)) {
    log('ERROR: Bot file not found: ' + botPath);
    process.exit(1);
  }
  
  // Get the current Node executable path
  const nodePath = process.execPath;
  log('Node executable: ' + nodePath);
  
  // Set working directory to project root
  const workingDir = path.dirname(__dirname);
  log('Working directory: ' + workingDir);
  
  // Spawn the bot process
  const child = spawn(nodePath, [botPath], {
    detached: true,
    stdio: 'inherit',
    env: process.env,
    cwd: workingDir
  });
  
  child.on('error', (err) => {
    log('ERROR: Failed to start bot: ' + err.message);
    process.exit(1);
  });
  
  // Unref the child to allow this script to exit
  child.unref();
  
  log('Bot started with PID: ' + child.pid);
  
  // Write PID to file for reference
  fs.writeFileSync(path.join(__dirname, 'bot-pid.txt'), child.pid.toString());
  
  // Exit this script
  setTimeout(() => {
    process.exit(0);
  }, 1000);
} catch (error) {
  log('ERROR: Error in start script: ' + error.message);
  process.exit(1);
} 