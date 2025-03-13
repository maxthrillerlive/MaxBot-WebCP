#!/usr/bin/env node

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const fs = require('fs');
const path = require('path');

// Update the require paths to use the correct locations
const BotUI = require('../ui');
const BotClient = require('../client');

// Helper function to safely create timestamps
function safeTimestamp() {
  try {
    return Date.now();
  } catch (e) {
    console.error(`Error creating timestamp: ${e.message}`);
    return 0;
  }
}

// Create a PID file to store the current process ID
const createPidFile = () => {
    try {
        const pidFile = path.join(__dirname, '..', 'maxbot-tui.pid');
        fs.writeFileSync(pidFile, process.pid.toString());
        console.log(`PID file created at ${pidFile}`);
        
        // Remove the PID file when the process exits
        process.on('exit', () => {
            try {
                if (fs.existsSync(pidFile)) {
                    fs.unlinkSync(pidFile);
                    console.log('PID file removed');
                }
            } catch (error) {
                console.error('Error removing PID file:', error);
            }
        });
        
        return pidFile;
    } catch (error) {
        console.error('Error creating PID file:', error);
        return null;
    }
};

// Add error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
console.log('Starting MaxBot TUI...');

// Create the PID file
createPidFile();

// Set up safety timeout
console.log('Setting up safety timeout (60 seconds)');
const safetyTimeout = setTimeout(() => {
    console.log('Safety timeout reached, forcing exit');
    process.exit(0);
}, 60000); // Increased to 60 seconds for more testing time

// Global variables for UI and client
let ui;
let client;

try {
    // Create and initialize the UI
    ui = new BotUI();
    console.log('UI instance created: Success');
    
    // Set up the screen
    ui.setupScreen();
    console.log('Setting up TUI screen...');
    
    // Render the screen
    ui.screen.render();
    console.log('Rendering TUI screen...');
    
    // Log success
    console.log('TUI setup complete');
    
    // Create the client
    client = new BotClient(ui);
    global.client = client; // Make client globally accessible
    console.log('BotClient constructor called with UI: UI provided');
    console.log('BotClient initialized, deferring Fedora integration');
    console.log('Client created with UI');
    
    // Skip setting up event handlers
    console.log('Skipping event handlers setup to avoid freezing');
    
    // Log success
    console.log('Application started successfully');
    
    // Update the UI with a message
    ui.logToConsole('LOG: Application started in safe mode - some features may be limited');
    
    // Set up exit handlers for the UI
    ui.screen.key(['escape', 'q', 'C-c'], function() {
        clearTimeout(safetyTimeout);
        console.log('Exit key pressed');
        
        // Ensure WebSocket is closed before exiting
        if (client && client.ws && client.ws.readyState === 1) {
            console.log('Closing WebSocket connection...');
            try {
                client.ws.close();
            } catch (e) {
                console.error('Error closing WebSocket:', e);
            }
        }
        
        // Force exit after a short delay to allow cleanup
        setTimeout(() => {
            process.exit(0);
        }, 500);
    });
    
    // Set up a click handler for the admin panel if it exists
    if (ui.adminBox) {
        ui.adminBox.on('click', function() {
            clearTimeout(safetyTimeout);
            console.log('Admin panel clicked, exiting...');
            
            // Ensure WebSocket is closed before exiting
            if (client && client.ws && client.ws.readyState === 1) {
                console.log('Closing WebSocket connection...');
                try {
                    client.ws.close();
                } catch (e) {
                    console.error('Error closing WebSocket:', e);
                }
            }
            
            // Force exit after a short delay to allow cleanup
            setTimeout(() => {
                process.exit(0);
            }, 500);
        });
    }
    
} catch (error) {
    console.error('Error starting application:', error);
    clearTimeout(safetyTimeout);
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

// Set up a periodic check to ensure the application can exit
const exitCheck = setInterval(() => {
    console.log('Checking application state...');
    // This helps keep the event loop active and allows the safety timeout to work
}, 5000);

// Clear the interval on exit
process.on('exit', () => {
    clearInterval(exitCheck);
    clearTimeout(safetyTimeout);
});

// Export the UI and client for debugging
module.exports = {
    ui,
    client
};