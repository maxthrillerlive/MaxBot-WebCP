#!/usr/bin/env node

const blessed = require('blessed');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Clean up PID file on exit
process.on('exit', () => {
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log('PID file removed');
    }
  } catch (e) {
    // Ignore errors
  }
});

// Create a screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'MaxBot TUI (Simplified)'
});

// Create status box
const statusBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '25%',
  label: ' Bot Status ',
  content: '{center}Connecting to MaxBot...{/center}',
  tags: true,
  border: {
    type: 'line',
    fg: 'blue'
  },
  style: {
    fg: 'white',
    border: {
      fg: 'blue'
    }
  }
});

// Create console box
const consoleBox = blessed.box({
  top: '25%',
  left: 0,
  width: '100%',
  height: '50%',
  label: ' Console ',
  content: '',
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  border: {
    type: 'line',
    fg: 'yellow'
  },
  style: {
    fg: 'white',
    border: {
      fg: 'yellow'
    }
  }
});

// Create exit box
const exitBox = blessed.box({
  top: '75%',
  left: 0,
  width: '100%',
  height: '25%',
  label: ' Exit Application ',
  content: '{center}{bold}Press Q, X, Escape, or Ctrl+C to exit{/bold}{/center}\n\n' +
           '{center}Application will automatically exit after 30 seconds{/center}',
  tags: true,
  border: {
    type: 'line',
    fg: 'red'
  },
  style: {
    fg: 'white',
    bg: 'red',
    border: {
      fg: 'red'
    }
  }
});

// Add boxes to screen
screen.append(statusBox);
screen.append(consoleBox);
screen.append(exitBox);

// Focus on exit box
exitBox.focus();

// Log to console
function logToConsole(message) {
  consoleBox.pushLine(message);
  consoleBox.setScrollPerc(100);
  screen.render();
}

// Update status
function updateStatus(status) {
  let content = '';
  
  if (status) {
    content = `Status: ${status.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'}\n` +
              `Channel: ${status.channel || 'N/A'}\n` +
              `Uptime: ${status.uptime || '0s'}`;
  } else {
    content = '{center}No status available{/center}';
  }
  
  statusBox.setContent(content);
  screen.render();
}

// Set up exit handlers
screen.key(['escape', 'q', 'Q', 'C-c', 'x', 'X'], () => {
  console.log('Exit key pressed');
  cleanup();
  process.exit(0);
});

// Set up a timer to exit automatically
const exitTimer = setTimeout(() => {
  console.log('Automatic exit timer reached');
  cleanup();
  process.exit(0);
}, 30 * 1000); // 30 seconds

// Cleanup function
function cleanup() {
  console.log('Cleaning up...');
  clearTimeout(exitTimer);
  
  // Clean up WebSocket if it exists
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.close();
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Remove PID file
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log('PID file removed');
    }
  } catch (e) {
    // Ignore errors
  }
}

// Initialize WebSocket connection
let ws = null;
try {
  // Get server URL from environment variables or use default
  const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
  const port = process.env.WEBSOCKET_PORT || '8080';
  const serverUrl = `ws://${host}:${port}`;
  
  logToConsole(`Connecting to WebSocket server at: ${serverUrl}`);
  
  // Create WebSocket connection
  ws = new WebSocket(serverUrl, {
    handshakeTimeout: 5000 // 5 seconds
  });
  
  // Set up WebSocket event handlers
  ws.on('open', () => {
    logToConsole('Connected to WebSocket server');
    updateStatus({ connected: true, channel: 'Unknown', uptime: '0s' });
  });
  
  ws.on('error', (error) => {
    logToConsole(`WebSocket error: ${error.message}`);
    updateStatus({ connected: false });
  });
  
  ws.on('close', () => {
    logToConsole('Disconnected from WebSocket server');
    updateStatus({ connected: false });
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      logToConsole(`Received message of type: ${message.type}`);
      
      if (message.type === 'status') {
        updateStatus(message.data);
      }
    } catch (error) {
      logToConsole(`Error processing message: ${error.message}`);
    }
  });
} catch (error) {
  logToConsole(`Error creating WebSocket connection: ${error.message}`);
  updateStatus({ connected: false });
}

// Render the screen
screen.render();

console.log('MaxBot TUI (Simplified) started');
logToConsole('Application started in simplified mode');
logToConsole('Will automatically exit after 30 seconds'); 