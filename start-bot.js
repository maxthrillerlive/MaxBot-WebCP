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
  
  // Check if the bot is already running by looking for the lock file
  const lockFile = path.join(__dirname, '..', 'bot.lock');
  if (fs.existsSync(lockFile)) {
    try {
      const pid = fs.readFileSync(lockFile, 'utf8');
      log('Found existing lock file with PID: ' + pid);
      
      // Try to check if the process is running
      try {
        process.kill(parseInt(pid), 0); // This will throw an error if the process doesn't exist
        log('Bot is already running with PID: ' + pid);
        log('If you want to restart the bot, use the Restart button instead.');
        process.exit(0);
      } catch (e) {
        // Process not found, safe to continue
        log('Found stale lock file, removing...');
        fs.unlinkSync(lockFile);
      }
    } catch (e) {
      log('Error checking lock file: ' + e.message);
      // Continue anyway
    }
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