#!/usr/bin/env node

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const WebSocket = require('ws');
const BotUI = require('./ui');
const BotClient = require('./client');

// Make these available globally for the UI
global.blessed = blessed;
global.contrib = contrib;
global.WebSocket = WebSocket;

console.log('Starting MaxBot TUI...');

try {
  // Create UI
  const ui = new BotUI();
  
  // Setup the screen
  ui.setupScreen();
  
  console.log('Creating bot client...');
  
  // Create client with UI
  const client = new BotClient(ui);
  
  // Set client reference in UI
  ui.setClient(client);
  
  console.log('Connecting to bot server...');
  
  // Connect to the bot server
  client.connect();
  
  // Initialize Fedora integration after a delay to ensure UI is ready
  setTimeout(() => {
    try {
      console.log('Initializing Fedora integration...');
      client.initializeFedora();
    } catch (error) {
      console.error('Error initializing Fedora integration:', error);
    }
  }, 1000);
  
  console.log('MaxBot TUI initialization complete');
} catch (error) {
  console.error('Error initializing MaxBot TUI:', error);
  process.exit(1);
} 