#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('Forcing exit of MaxBot TUI...');

// Try to read the PID file
const pidFilePath = path.join(__dirname, 'maxbot-tui.pid');

try {
  if (fs.existsSync(pidFilePath)) {
    const pid = fs.readFileSync(pidFilePath, 'utf8').trim();
    console.log(`Found PID file with PID: ${pid}`);
    
    // Try to kill the process
    if (process.platform === 'win32') {
      exec(`taskkill /F /PID ${pid}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error killing process: ${error.message}`);
          killAllNodeProcesses();
        } else {
          console.log(`Process ${pid} terminated successfully`);
          try {
            fs.unlinkSync(pidFilePath);
            console.log('PID file removed');
          } catch (e) {
            console.error(`Error removing PID file: ${e.message}`);
          }
        }
      });
    } else {
      // Linux/Mac
      exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error killing process: ${error.message}`);
          killAllNodeProcesses();
        } else {
          console.log(`Process ${pid} terminated successfully`);
          try {
            fs.unlinkSync(pidFilePath);
            console.log('PID file removed');
          } catch (e) {
            console.error(`Error removing PID file: ${e.message}`);
          }
        }
      });
    }
  } else {
    console.log('PID file not found, killing all Node.js processes');
    killAllNodeProcesses();
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  killAllNodeProcesses();
}

function killAllNodeProcesses() {
  if (process.platform === 'win32') {
    exec('taskkill /F /IM node.exe', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error killing all Node.js processes: ${error.message}`);
      } else {
        console.log('All Node.js processes terminated');
      }
    });
  } else {
    // Linux/Mac
    exec('pkill -9 node', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error killing all Node.js processes: ${error.message}`);
      } else {
        console.log('All Node.js processes terminated');
      }
    });
  }
} 