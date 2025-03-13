#!/usr/bin/env node

const blessed = require('blessed');
const contrib = require('blessed-contrib');

// Update the require paths to use the correct locations
const BotUI = require('../ui');
const BotClient = require('../client');

// Start the application
console.log('Starting MaxBot TUI...');

try {
  // Create and initialize the UI
  const ui = new BotUI();
  console.log('UI instance created:', ui ? 'Success' : 'Failed');
  
  // Set up the screen
  ui.setupScreen();
  console.log('Screen setup complete');
  
  // Create the client and connect to the server
  const client = new BotClient(ui);
  console.log('Client created with UI');
  
  // No need to call client.connect() - it's already connecting in the constructor
  
} catch (error) {
  console.error('Error starting application:', error);
  process.exit(1);
}

// Override console methods to redirect to our UI
function setupConsoleOverride(client) {
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug
    };

    // Override console.log
    console.log = (...args) => {
        const message = args.join(' ');
        if (client && client.ui) {
            client.ui.logToConsole(message);
        }
        originalConsole.log(...args); // Keep original logging for debugging
    };

    // Override console.info
    console.info = (...args) => {
        const message = args.join(' ');
        if (client && client.ui) {
            client.ui.logToConsole(`{cyan-fg}INFO:{/cyan-fg} ${message}`);
        }
        originalConsole.info(...args);
    };

    // Override console.warn
    console.warn = (...args) => {
        const message = args.join(' ');
        if (client && client.ui) {
            client.ui.logToConsole(`{yellow-fg}WARN:{/yellow-fg} ${message}`);
        }
        originalConsole.warn(...args);
    };

    // Override console.error
    console.error = (...args) => {
        const message = args.join(' ');
        if (client && client.ui) {
            client.ui.logToConsole(`{red-fg}ERROR:{/red-fg} ${message}`);
        }
        originalConsole.error(...args);
    };

    // Override console.debug
    console.debug = (...args) => {
        const message = args.join(' ');
        if (client && client.ui) {
            // Only show debug messages if debug mode is enabled
            if (process.env.DEBUG === 'true') {
                client.ui.logToConsole(`{gray-fg}DEBUG:{/gray-fg} ${message}`);
            }
        }
        originalConsole.debug(...args);
    };

    return originalConsole;
}

// Start the client with console override
const originalConsole = setupConsoleOverride(client);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    if (client && client.ui) {
        client.ui.logToConsole(`{red-fg}UNCAUGHT ERROR:{/red-fg} ${error.message}`);
    }
    console.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    if (client && client.ui) {
        client.ui.logToConsole(`{red-fg}UNHANDLED REJECTION:{/red-fg} ${reason}`);
    }
    console.error('Unhandled Rejection:', reason);
});