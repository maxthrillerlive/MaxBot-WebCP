#!/usr/bin/env node

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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

// Create a direct WebSocket connection to the server
let ws = null;
let pingInterval = null;

// Connect to WebSocket server
function connectToWebSocket() {
    try {
        // Get server URL from environment variables or use default
        const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
        const port = process.env.WEBSOCKET_PORT || '8080';
        const serverUrl = `ws://${host}:${port}`;
        
        console.log(`Connecting to WebSocket server at: ${serverUrl}`);
        
        ws = new WebSocket(serverUrl);
        
        // Set up heartbeat mechanism
        ws.on('open', () => {
            console.log('Connected to WebSocket server');
            
            // Send registration message
            const clientId = `MaxBot-TUI-${Math.floor(Math.random() * 10000)}`;
            const registerMsg = {
                type: 'register',
                client_id: clientId,
                client_type: 'tui',
                timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(registerMsg));
            console.log('Sent registration message');
            
            // Set up ping interval to keep connection alive
            // This is important - the server expects clients to respond to ping frames
            clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    // Send application-level ping
                    const pingMsg = {
                        type: 'ping',
                        client_id: clientId,
                        timestamp: Date.now()
                    };
                    
                    ws.send(JSON.stringify(pingMsg));
                    console.log('Sent ping message');
                } else {
                    clearInterval(pingInterval);
                }
            }, 25000); // Send ping every 25 seconds (server checks every 30)
        });
        
        // Handle WebSocket-level ping
        ws.on('ping', () => {
            // Automatically respond with pong (ws library handles this)
            console.log('Received WebSocket ping');
        });
        
        ws.on('message', (data) => {
            try {
                console.log(`Received raw data: ${data.toString()}`);
                const message = JSON.parse(data.toString());
                
                if (message.type) {
                    console.log(`Received message of type: ${message.type}`);
                    
                    if (message.type === 'STATUS') {
                        console.log('Received status update');
                    } else if (message.type === 'pong') {
                        console.log('Received pong response');
                    }
                } else {
                    console.log('Received message without type');
                }
            } catch (error) {
                console.error(`Error processing message: ${error.message}`);
            }
        });
        
        ws.on('close', (code, reason) => {
            console.log(`Disconnected from WebSocket server (Code: ${code}, Reason: ${reason || 'No reason provided'})`);
            clearInterval(pingInterval);
            
            // Attempt to reconnect after a delay
            setTimeout(() => {
                if (ui && ui.screen) {
                    console.log('Attempting to reconnect...');
                    connectToWebSocket();
                }
            }, 1000);
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error: ${error.message}`);
        });
        
        return ws;
    } catch (error) {
        console.error(`Error creating WebSocket: ${error.message}`);
        return null;
    }
}

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
    
    // Connect to WebSocket server directly
    connectToWebSocket();
    
    // Log success
    console.log('Application started successfully');
    
    // Update the UI with a message
    ui.logToConsole('LOG: Application started in safe mode - some features may be limited');
    
    // Set up exit handlers for the UI
    ui.screen.key(['escape', 'q', 'C-c'], function() {
        clearTimeout(safetyTimeout);
        console.log('Exit key pressed');
        
        // Ensure WebSocket is closed before exiting
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('Closing WebSocket connection...');
            try {
                // Send a disconnect message
                const disconnectMsg = {
                    type: 'disconnect',
                    client_id: 'MaxBot-TUI',
                    timestamp: Date.now()
                };
                
                ws.send(JSON.stringify(disconnectMsg));
                ws.close();
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
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log('Closing WebSocket connection...');
                try {
                    // Send a disconnect message
                    const disconnectMsg = {
                        type: 'disconnect',
                        client_id: 'MaxBot-TUI',
                        timestamp: Date.now()
                    };
                    
                    ws.send(JSON.stringify(disconnectMsg));
                    ws.close();
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
    clearInterval(pingInterval);
    clearTimeout(safetyTimeout);
});

// Export the UI and client for debugging
module.exports = {
    ui,
    client
};