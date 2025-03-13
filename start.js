#!/usr/bin/env node

const { execSync } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

console.log('Checking if MaxBot server is running...');

// Function to check if the WebSocket server is available
function checkServerAvailability() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080', {
      handshakeTimeout: 3000 // 3 second timeout
    });
    
    ws.on('open', () => {
      console.log('MaxBot server is running and available.');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', () => {
      console.log('MaxBot server is not available.');
      resolve(false);
    });
  });
}

// Main function
async function main() {
  try {
    const serverAvailable = await checkServerAvailability();
    
    if (!serverAvailable) {
      console.log('\nWARNING: MaxBot server is not available!');
      console.log('The TUI will not function correctly without the server.');
      console.log('Options:');
      console.log('1. Start MaxBot server first, then try again');
      console.log('2. Continue anyway (not recommended)');
      console.log('3. Exit');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      readline.question('Choose an option (1-3): ', (answer) => {
        readline.close();
        
        if (answer === '1' || answer === '') {
          console.log('Please start the MaxBot server and try again.');
          process.exit(0);
        } else if (answer === '2') {
          console.log('Starting TUI without server connection...');
          startTUI();
        } else {
          console.log('Exiting.');
          process.exit(0);
        }
      });
    } else {
      // Server is available, start the TUI
      startTUI();
    }
  } catch (error) {
    console.error('Error checking server availability:', error);
    console.log('Starting TUI anyway...');
    startTUI();
  }
}

function startTUI() {
  console.log('Starting MaxBot TUI...');
  try {
    // Set a timeout to automatically exit if something goes wrong
    const safetyTimeout = setTimeout(() => {
      console.log('Safety timeout reached. Forcing exit.');
      process.exit(1);
    }, 60000); // 60 seconds
    
    // Start the TUI
    require('./src/index.js');
    
    // If we get here, clear the safety timeout
    clearTimeout(safetyTimeout);
  } catch (error) {
    console.error('Error starting TUI:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 