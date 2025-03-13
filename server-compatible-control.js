#!/usr/bin/env node

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Generate a unique client ID
const clientId = `MaxBot-TUI-${uuidv4().substring(0, 8)}`;

// Initialize application state
const appState = {
  running: true,
  wsStatus: 'Disconnected',
  wsMessages: 0,
  reconnectAttempts: 0,
  lastPingTime: 0,
  lastStatusTime: 0,
  serverErrors: [],
  logs: [],
  chatMessages: [], // Add chat messages array
  commands: [] // Add commands array
};

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui-control.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Set up safety timeout
console.log('Setting up safety timeout (1 hour)');
const safetyTimeout = setTimeout(() => {
  console.log('Safety timeout reached, forcing exit');
  cleanup();
  process.exit(0);
}, 3600000); // 1 hour

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Add log function
function addLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    time: timestamp,
    message: message
  };
  
  appState.logs.push(logEntry);
  console.log(`[${timestamp}] ${message}`);
  
  // Keep logs to a reasonable size
  if (appState.logs.length > 1000) {
    appState.logs.shift();
  }
}

// Add chat message function
function addChatMessage(username, message, channel, badges = {}) {
  const timestamp = new Date().toISOString();
  const chatEntry = {
    time: timestamp,
    username,
    message,
    channel,
    badges
  };
  
  appState.chatMessages.push(chatEntry);
  
  // Keep chat messages to a reasonable size
  if (appState.chatMessages.length > 100) {
    appState.chatMessages.shift();
  }
}

// Connect to WebSocket server
let ws = null;
let pingInterval = null;

function connectToWebSocket() {
  try {
    // Get server URL from environment variables or use default
    const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
    const port = process.env.WEBSOCKET_PORT || '8080';
    const serverUrl = `ws://${host}:${port}`;
    
    addLog(`Connecting to WebSocket server at: ${serverUrl}`);
    appState.reconnectAttempts++;
    
    ws = new WebSocket(serverUrl, {
      handshakeTimeout: 5000 // 5 seconds
    });
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        addLog('Connection timeout reached, closing socket');
        try {
          ws.terminate();
        } catch (e) {
          // Ignore errors
        }
      }
    }, 10000);
    
    // Handle WebSocket-level ping (automatically responds with pong)
    ws.on('ping', () => {
      addLog('Received WebSocket ping');
      // The ws library automatically responds with a pong
    });
    
    // Handle WebSocket-level pong
    ws.on('pong', () => {
      addLog('Received WebSocket pong');
      appState.lastPongTime = Date.now();
    });
    
    ws.on('open', () => {
      clearTimeout(connectionTimeout);
      addLog('Connected to WebSocket server');
      appState.wsStatus = 'Connected';
      appState.reconnectAttempts = 0;
      
      // Send GET_STATUS instead of register
      try {
        const statusRequest = {
          type: 'GET_STATUS',  // This is recognized by index.js
          client_id: clientId,
          timestamp: Date.now()
        };
        
        ws.send(JSON.stringify(statusRequest));
        addLog('Sent status request');
      } catch (e) {
        addLog(`Error sending status request: ${e.message}`);
      }
      
      // Set up ping interval to keep connection alive
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Send application-level ping message
            const pingMsg = {
              type: 'ping',
              client_id: clientId,
              timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(pingMsg));
            appState.lastPingTime = Date.now();
            addLog('Sent ping message');
            
            // Also send a status request periodically
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  const statusRequest = {
                    type: 'GET_STATUS',
                    client_id: clientId,
                    timestamp: Date.now()
                  };
                  
                  ws.send(JSON.stringify(statusRequest));
                  addLog('Sent periodic status request');
                } catch (e) {
                  addLog(`Error sending status request: ${e.message}`);
                }
              }
            }, 5000); // 5 seconds after ping
            
          } catch (e) {
            addLog(`Error sending ping: ${e.message}`);
            clearInterval(pingInterval);
          }
        } else {
          // WebSocket is not open, clear the interval
          addLog('WebSocket not open, clearing ping interval');
          clearInterval(pingInterval);
        }
      }, 20000); // Send ping every 20 seconds (server checks every 60)
    });
    
    ws.on('message', (data) => {
      try {
        // Log the raw data for debugging
        const dataStr = data.toString();
        addLog(`Received raw data: ${dataStr}`);
        
        // Check if the data is valid JSON
        if (!dataStr.trim().startsWith('{') && !dataStr.trim().startsWith('[')) {
          addLog(`Received non-JSON data: ${dataStr}`);
          return;
        }
        
        const message = JSON.parse(dataStr);
        
        // Check if the message has a type
        if (!message.type) {
          addLog(`Received message without type: ${JSON.stringify(message)}`);
          
          // Try to determine if this is a status message
          if (message.connectionState && message.username) {
            addLog('This appears to be a status message, handling as STATUS type');
            // Store the status information if needed
            appState.wsMessages++;
            appState.lastStatusTime = Date.now();
            return;
          }
          
          return;
        }
        
        appState.wsMessages++;
        
        // Handle different message types
        switch (message.type.toUpperCase()) {  // Convert to uppercase for case-insensitive comparison
          case 'PONG':
            appState.lastPingTime = Date.now();
            addLog('Received pong response');
            break;
            
          case 'STATUS':
            addLog(`Received status update`);
            appState.lastStatusTime = Date.now();
            
            // Store commands if available
            if (message.data && message.data.commands) {
              appState.commands = message.data.commands;
              addLog(`Updated commands list (${appState.commands.length} commands)`);
            }
            break;
            
          case 'COMMANDS':
            addLog(`Received commands list`);
            if (message.data) {
              appState.commands = message.data;
              addLog(`Updated commands list (${appState.commands.length} commands)`);
            }
            break;
            
          case 'CHAT_MESSAGE':
            const chatData = message.data || {};
            addLog(`Received chat message from ${chatData.username || 'unknown'}`);
            
            // Add to chat messages
            addChatMessage(
              chatData.username || 'unknown',
              chatData.message || '',
              chatData.channel || '#unknown',
              chatData.badges || {}
            );
            break;
            
          case 'CONNECTION_STATE':
            addLog(`Received connection state: ${message.state || 'unknown'}`);
            break;
            
          case 'ERROR':
            addLog(`Received error from server: ${message.error || 'Unknown error'}`);
            appState.serverErrors.push({
              time: new Date().toISOString(),
              error: message.error || 'Unknown error'
            });
            break;
            
          default:
            addLog(`Received message of type: ${message.type}`);
        }
      } catch (error) {
        addLog(`Error processing message: ${error.message}`);
      }
    });
    
    ws.on('close', (code, reason) => {
      addLog(`Disconnected from WebSocket server (Code: ${code}, Reason: ${reason || 'No reason provided'})`);
      appState.wsStatus = 'Disconnected';
      clearInterval(pingInterval);
      
      // Implement exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(1.5, appState.reconnectAttempts - 1), 30000);
      addLog(`Will attempt to reconnect in ${delay/1000} seconds`);
      
      setTimeout(() => {
        if (appState.running) {
          addLog('Attempting to reconnect...');
          connectToWebSocket();
        }
      }, delay);
    });
    
    ws.on('error', (error) => {
      addLog(`WebSocket error: ${error.message}`);
      appState.wsStatus = 'Error';
      appState.serverErrors.push({
        time: new Date().toISOString(),
        error: error.message
      });
      
      // Don't need to close here, the 'close' event will be triggered automatically
    });
    
    return ws;
  } catch (error) {
    addLog(`Error creating WebSocket: ${error.message}`);
    appState.wsStatus = 'Error';
    appState.serverErrors.push({
      time: new Date().toISOString(),
      error: error.message
    });
    
    // Implement exponential backoff for reconnection
    const delay = Math.min(1000 * Math.pow(1.5, appState.reconnectAttempts - 1), 30000);
    addLog(`Will attempt to reconnect in ${delay/1000} seconds`);
    
    setTimeout(() => {
      if (appState.running) {
        addLog('Attempting to reconnect...');
        connectToWebSocket();
      }
    }, delay);
    
    return null;
  }
}

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: appState.wsStatus,
    messages: appState.wsMessages,
    reconnectAttempts: appState.reconnectAttempts,
    errors: appState.serverErrors.slice(-10) // Return last 10 errors
  });
});

app.get('/api/logs', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json(appState.logs.slice(-count));
});

app.get('/api/chat', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json(appState.chatMessages.slice(-count));
});

app.get('/api/commands', (req, res) => {
  res.json(appState.commands);
});

app.post('/api/command', (req, res) => {
  const { command, channel } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    const commandMsg = {
      type: 'EXECUTE_COMMAND',
      command,
      channel: channel || process.env.CHANNEL_NAME || '#channel',
      client_id: clientId,
      timestamp: Date.now()
    };
    
    ws.send(JSON.stringify(commandMsg));
    addLog(`Sent command: ${command}`);
    
    res.json({ success: true, message: `Command "${command}" sent` });
  } catch (error) {
    addLog(`Error sending command: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', (req, res) => {
  const { message, channel } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    // Use CHAT_COMMAND for server.js or EXECUTE_COMMAND for index.js
    const chatMsg = {
      type: 'CHAT_COMMAND',  // This works with server.js
      message,
      channel: channel || process.env.CHANNEL_NAME || '#channel',
      client_id: clientId,
      timestamp: Date.now()
    };
    
    ws.send(JSON.stringify(chatMsg));
    addLog(`Sent chat message: ${message}`);
    
    res.json({ success: true, message: `Chat message sent` });
  } catch (error) {
    addLog(`Error sending chat message: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exit', (req, res) => {
  addLog('Exit requested via API');
  res.json({ success: true, message: 'Exiting...' });
  
  // Schedule cleanup and exit
  setTimeout(() => {
    cleanup();
    process.exit(0);
  }, 500);
});

// Serve HTML for the control panel
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MaxBot TUI Control Panel</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #1e1e1e;
        color: #e0e0e0;
      }
      .container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 10px;
        box-sizing: border-box;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background-color: #2d2d2d;
        border-radius: 5px;
        margin-bottom: 10px;
      }
      .status {
        display: flex;
        align-items: center;
      }
      .status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 10px;
      }
      .connected { background-color: #4CAF50; }
      .disconnected { background-color: #F44336; }
      .error { background-color: #FF9800; }
      
      .main-content {
        display: flex;
        flex: 1;
        gap: 10px;
        overflow: hidden;
      }
      
      .panel {
        flex: 1;
        background-color: #2d2d2d;
        border-radius: 5px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .panel-header {
        font-weight: bold;
        margin-bottom: 10px;
        padding-bottom: 5px;
        border-bottom: 1px solid #444;
      }
      
      .logs-container, .chat-container {
        flex: 1;
        overflow-y: auto;
        font-family: monospace;
        background-color: #1a1a1a;
        padding: 10px;
        border-radius: 3px;
      }
      
      .log-entry {
        margin-bottom: 5px;
        word-wrap: break-word;
      }
      
      .chat-entry {
        margin-bottom: 8px;
        word-wrap: break-word;
      }
      
      .chat-username {
        font-weight: bold;
        color: #4CAF50;
      }
      
      .chat-time {
        color: #888;
        font-size: 0.8em;
      }
      
      .chat-message {
        margin-top: 2px;
      }
      
      .input-container {
        display: flex;
        margin-top: 10px;
      }
      
      input[type="text"] {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 3px;
        background-color: #3a3a3a;
        color: #e0e0e0;
      }
      
      button {
        padding: 8px 15px;
        margin-left: 5px;
        border: none;
        border-radius: 3px;
        background-color: #4CAF50;
        color: white;
        cursor: pointer;
      }
      
      button:hover {
        background-color: #45a049;
      }
      
      button.danger {
        background-color: #F44336;
      }
      
      button.danger:hover {
        background-color: #d32f2f;
      }
      
      .commands-container {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
      }
      
      .command-button {
        padding: 5px 10px;
        background-color: #3a3a3a;
        border-radius: 3px;
        cursor: pointer;
      }
      
      .command-button:hover {
        background-color: #4a4a4a;
      }
      
      .command-button.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      @media (max-width: 768px) {
        .main-content {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>MaxBot TUI Control Panel</h1>
        <div class="status">
          <div id="status-indicator" class="status-indicator disconnected"></div>
          <span id="status-text">Disconnected</span>
        </div>
      </div>
      
      <div class="main-content">
        <div class="panel">
          <div class="panel-header">Chat</div>
          <div id="chat-container" class="chat-container"></div>
          <div class="input-container">
            <input type="text" id="chat-input" placeholder="Type a message...">
            <button id="send-chat">Send</button>
          </div>
        </div>
        
        <div class="panel">
          <div class="panel-header">Logs</div>
          <div id="logs-container" class="logs-container"></div>
          <div class="commands-container" id="commands-container"></div>
          <div class="input-container">
            <input type="text" id="command-input" placeholder="Type a command...">
            <button id="send-command">Execute</button>
            <button id="exit-button" class="danger">Exit</button>
          </div>
        </div>
      </div>
    </div>
    
    <script>
      // Elements
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      const logsContainer = document.getElementById('logs-container');
      const chatContainer = document.getElementById('chat-container');
      const commandsContainer = document.getElementById('commands-container');
      const chatInput = document.getElementById('chat-input');
      const commandInput = document.getElementById('command-input');
      const sendChatButton = document.getElementById('send-chat');
      const sendCommandButton = document.getElementById('send-command');
      const exitButton = document.getElementById('exit-button');
      
      // Update status
      function updateStatus() {
        fetch('/api/status')
          .then(response => response.json())
          .then(data => {
            statusText.textContent = data.status;
            statusIndicator.className = 'status-indicator';
            
            if (data.status === 'Connected') {
              statusIndicator.classList.add('connected');
            } else if (data.status === 'Error') {
              statusIndicator.classList.add('error');
            } else {
              statusIndicator.classList.add('disconnected');
            }
          })
          .catch(error => {
            console.error('Error fetching status:', error);
            statusText.textContent = 'Error';
            statusIndicator.className = 'status-indicator error';
          });
      }
      
      // Update logs
      function updateLogs() {
        fetch('/api/logs?count=100')
          .then(response => response.json())
          .then(logs => {
            logsContainer.innerHTML = '';
            logs.forEach(log => {
              const logEntry = document.createElement('div');
              logEntry.className = 'log-entry';
              logEntry.textContent = \`[\${new Date(log.time).toLocaleTimeString()}] \${log.message}\`;
              logsContainer.appendChild(logEntry);
            });
            logsContainer.scrollTop = logsContainer.scrollHeight;
          })
          .catch(error => {
            console.error('Error fetching logs:', error);
          });
      }
      
      // Update chat
      function updateChat() {
        fetch('/api/chat?count=100')
          .then(response => response.json())
          .then(messages => {
            chatContainer.innerHTML = '';
            messages.forEach(msg => {
              const chatEntry = document.createElement('div');
              chatEntry.className = 'chat-entry';
              
              const chatHeader = document.createElement('div');
              chatHeader.innerHTML = \`<span class="chat-username">\${msg.username}</span> <span class="chat-time">[\${new Date(msg.time).toLocaleTimeString()}]</span>\`;
              
              const chatMessage = document.createElement('div');
              chatMessage.className = 'chat-message';
              chatMessage.textContent = msg.message;
              
              chatEntry.appendChild(chatHeader);
              chatEntry.appendChild(chatMessage);
              chatContainer.appendChild(chatEntry);
            });
            chatContainer.scrollTop = chatContainer.scrollHeight;
          })
          .catch(error => {
            console.error('Error fetching chat:', error);
          });
      }
      
      // Update commands
      function updateCommands() {
        fetch('/api/commands')
          .then(response => response.json())
          .then(commands => {
            commandsContainer.innerHTML = '';
            commands.forEach(cmd => {
              const commandButton = document.createElement('div');
              commandButton.className = 'command-button';
              if (!cmd.enabled) {
                commandButton.classList.add('disabled');
              }
              commandButton.textContent = cmd.trigger || cmd.name;
              commandButton.title = cmd.description || '';
              
              if (cmd.enabled) {
                commandButton.addEventListener('click', () => {
                  commandInput.value = cmd.trigger || cmd.name;
                });
              }
              
              commandsContainer.appendChild(commandButton);
            });
          })
          .catch(error => {
            console.error('Error fetching commands:', error);
          });
      }
      
      // Send chat message
      function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              chatInput.value = '';
              updateChat();
            } else {
              console.error('Error sending chat message:', data.error);
            }
          })
          .catch(error => {
            console.error('Error sending chat message:', error);
          });
      }
      
      // Send command
      function sendCommand() {
        const command = commandInput.value.trim();
        if (!command) return;
        
        fetch('/api/command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              commandInput.value = '';
              updateLogs();
            } else {
              console.error('Error sending command:', data.error);
            }
          })
          .catch(error => {
            console.error('Error sending command:', error);
          });
      }
      
      // Exit application
      function exitApplication() {
        if (confirm('Are you sure you want to exit?')) {
          fetch('/api/exit', {
            method: 'POST'
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Application is exiting. You can close this window.');
              }
            })
            .catch(error => {
              console.error('Error exiting application:', error);
            });
        }
      }
      
      // Event listeners
      sendChatButton.addEventListener('click', sendChatMessage);
      chatInput.addEventListener('keypress', event => {
        if (event.key === 'Enter') {
          sendChatMessage();
        }
      });
      
      sendCommandButton.addEventListener('click', sendCommand);
      commandInput.addEventListener('keypress', event => {
        if (event.key === 'Enter') {
          sendCommand();
        }
      });
      
      exitButton.addEventListener('click', exitApplication);
      
      // Initial updates
      updateStatus();
      updateLogs();
      updateChat();
      updateCommands();
      
      // Set up polling
      setInterval(updateStatus, 5000);
      setInterval(updateLogs, 2000);
      setInterval(updateChat, 2000);
      setInterval(updateCommands, 10000);
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Start the server
const PORT = process.env.HTTP_PORT || 3000;
server.listen(PORT, () => {
  console.log(`MaxBot TUI HTTP Control started on http://localhost:${PORT}`);
  
  // Connect to WebSocket server
  connectToWebSocket();
});

// Cleanup function
function cleanup() {
  addLog('Cleaning up...');
  
  // Close WebSocket connection
  if (ws) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        // Don't send a disconnect message, just close the connection
        ws.close();
      }
    } catch (e) {
      addLog(`Error closing WebSocket: ${e.message}`);
    }
  }
  
  // Clear intervals
  clearInterval(pingInterval);
  clearTimeout(safetyTimeout);
  
  // Remove PID file
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      addLog('PID file removed');
    }
  } catch (e) {
    addLog(`Error removing PID file: ${e.message}`);
  }
}

// Handle exit events
process.on('exit', cleanup);
process.on('SIGINT', () => {
  addLog('SIGINT received, exiting...');
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  addLog('SIGTERM received, exiting...');
  cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  addLog(`Uncaught exception: ${error.message}`);
  addLog(error.stack);
  cleanup();
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  addLog(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  cleanup();
  process.exit(1);
});

console.log('MaxBot TUI HTTP Control started'); 