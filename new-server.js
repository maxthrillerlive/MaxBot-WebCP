// Server-compatible control panel for MaxBot
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize application state
const appState = {
  logs: [],
  chat: [],
  status: {
    connected: false,
    uptime: null,
    pid: null
  },
  stats: {
    messagesReceived: 0,
    messagesSent: 0,
    reconnections: 0,
    commandsExecuted: 0,
    chatMessagesSent: 0,
    errors: 0,
    connectionHistory: []
  }
};

// WebSocket connection handling
let ws = null;

wss.on('connection', (socket) => {
  console.log('WebSocket client connected');
  
  // Store the socket for later use
  ws = socket;
  
  // Set up ping-pong for keeping the connection alive
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
  
  // Handle messages from the client
  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle different message types
      if (data.type === 'STATUS') {
        appState.status = {
          ...appState.status,
          ...data.status
        };
      } else if (data.type === 'LOG') {
        appState.logs.push({
          time: data.time || new Date().toISOString(),
          message: data.message
        });
        
        // Limit logs to 1000 entries
        if (appState.logs.length > 1000) {
          appState.logs.shift();
        }
      } else if (data.type === 'CHAT') {
        appState.chat.push({
          time: data.time || new Date().toISOString(),
          username: data.username,
          message: data.message,
          badges: data.badges || {}
        });
        
        // Limit chat to 200 entries
        if (appState.chat.length > 200) {
          appState.chat.shift();
        }
      } else if (data.type === 'STATS') {
        appState.stats = {
          ...appState.stats,
          ...data.stats
        };
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  // Handle socket close
  socket.on('close', () => {
    console.log('WebSocket client disconnected');
    ws = null;
  });
  
  // Send initial status request
  socket.send(JSON.stringify({ type: 'REQUEST_STATUS' }));
});

// Set up a heartbeat interval to check for dead connections
const interval = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (socket.isAlive === false) {
      return socket.terminate();
    }
    
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json(appState.status);
});

app.get('/api/logs', (req, res) => {
  res.json(appState.logs);
});

app.get('/api/chat', (req, res) => {
  res.json(appState.chat);
});

app.get('/api/commands', (req, res) => {
  // This is a placeholder - you'll need to implement command retrieval
  res.json([
    { name: 'help', description: 'Show available commands' },
    { name: 'dice', description: 'Roll a dice' },
    { name: 'uptime', description: 'Show bot uptime' }
  ]);
});

app.get('/api/stats', (req, res) => {
  res.json(appState.stats);
});

// Add API endpoint for environment variables
app.get('/api/admin/env', (req, res) => {
  try {
    const envPath = path.join(__dirname, '..', 'MaxBot', '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    } else {
      // If .env doesn't exist, try to find a sample or create a new one
      const samplePath = path.join(__dirname, '..', 'MaxBot', '.env.sample');
      if (fs.existsSync(samplePath)) {
        envContent = fs.readFileSync(samplePath, 'utf8');
      } else {
        envContent = '# Bot Configuration\n' +
                    'BOT_USERNAME=your_bot_username\n' +
                    'CHANNEL_NAME=your_channel\n' +
                    'OAUTH_TOKEN=oauth:your_token_here\n' +
                    'PREFIX=!\n' +
                    '# Add other configuration variables as needed';
      }
    }
    
    res.json({ content: envContent });
  } catch (error) {
    console.error('Error reading env file:', error);
    res.status(500).json({ error: 'Failed to read environment variables: ' + error.message });
  }
});

app.post('/api/admin/env', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'No content provided' });
    }
    
    const envPath = path.join(__dirname, '..', 'MaxBot', '.env');
    
    // Create a backup of the current .env file
    if (fs.existsSync(envPath)) {
      const backupPath = path.join(__dirname, '..', 'MaxBot', '.env.backup.' + Date.now());
      fs.copyFileSync(envPath, backupPath);
      console.log('Created backup of .env file at ' + backupPath);
    }
    
    // Write the new content
    fs.writeFileSync(envPath, content);
    console.log('Environment variables updated successfully');
    
    res.json({ success: true, message: 'Environment variables updated successfully' });
  } catch (error) {
    console.error('Error saving env file:', error);
    res.status(500).json({ error: 'Failed to save environment variables: ' + error.message });
  }
});

// Admin endpoints
app.post('/api/admin/restart', (req, res) => {
  if (ws) {
    ws.send(JSON.stringify({ type: 'COMMAND', command: 'RESTART' }));
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: 'Restart command sent to bot'
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Restart Requested',
      reason: 'User initiated restart'
    });
    
    res.json({ success: true, message: 'Restart command sent' });
  } else {
    res.status(503).json({ error: 'Bot is not connected' });
  }
});

app.post('/api/admin/shutdown', (req, res) => {
  if (ws) {
    ws.send(JSON.stringify({ type: 'COMMAND', command: 'SHUTDOWN' }));
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: 'Shutdown command sent to bot'
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Shutdown Requested',
      reason: 'User initiated shutdown'
    });
    
    res.json({ success: true, message: 'Shutdown command sent' });
  } else {
    res.status(503).json({ error: 'Bot is not connected' });
  }
});

app.get('/api/admin/start-bot', (req, res) => {
  try {
    const botPath = path.join(__dirname, '..', 'MaxBot', 'index.js');
    
    // Check if the file exists
    if (!fs.existsSync(botPath)) {
      console.error('Bot file not found:', botPath);
      return res.status(404).send('Bot file not found: ' + botPath);
    }
    
    // Get the current Node executable path
    const nodePath = process.execPath;
    
    // Spawn the bot process
    const child = spawn(nodePath, [botPath], {
      detached: true,
      stdio: 'inherit',
      env: process.env,
      cwd: path.dirname(__dirname)
    });
    
    child.on('error', (err) => {
      console.error('Failed to start bot:', err);
      return res.status(500).send('Failed to start bot: ' + err.message);
    });
    
    // Unref the child to allow this process to exit
    child.unref();
    
    console.log('Bot started with PID:', child.pid);
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: 'Bot start initiated via external script'
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Start Requested',
      reason: 'User initiated start via external script'
    });
    
    return res.status(200).send('Bot start initiated');
  } catch (error) {
    console.error('Error starting bot:', error);
    return res.status(500).send('Error starting bot: ' + error.message);
  }
});

// Serve the HTML control panel
app.get('/', (req, res) => {
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MaxBot Control Panel</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #1a1a1a;
            color: #f0f0f0;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3 {
            color: #ddd;
        }
        .panel {
            background-color: #2a2a2a;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .tabs {
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid #444;
        }
        .tab-button {
            background-color: transparent;
            border: none;
            color: #aaa;
            padding: 10px 15px;
            cursor: pointer;
            font-size: 16px;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
        }
        .tab-button:hover {
            color: #ddd;
        }
        .tab-button.active {
            color: #fff;
            border-bottom: 2px solid #3a6ea5;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-connected {
            background-color: #4CAF50;
        }
        .status-disconnected {
            background-color: #F44336;
        }
        .log-entry {
            margin-bottom: 8px;
            border-bottom: 1px solid #333;
            padding-bottom: 8px;
        }
        .log-time {
            color: #888;
            font-size: 0.9em;
            margin-right: 10px;
        }
        .log-message {
            color: #ddd;
        }
        .chat-container {
            height: 400px;
            overflow-y: auto;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 10px;
            background-color: #222;
        }
        .chat-entry {
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #333;
        }
        .chat-username {
            font-weight: bold;
            color: #3a6ea5;
        }
        .chat-message {
            color: #ddd;
        }
        .chat-time {
            color: #888;
            font-size: 0.8em;
        }
        .chat-input-container {
            display: flex;
            margin-top: 15px;
        }
        .chat-input {
            flex-grow: 1;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            background-color: #333;
            color: #ddd;
        }
        .chat-send-btn {
            padding: 8px 15px;
            margin-left: 10px;
            background-color: #3a6ea5;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .command-list {
            list-style-type: none;
            padding: 0;
        }
        .command-item {
            padding: 10px;
            border-bottom: 1px solid #333;
        }
        .command-name {
            font-weight: bold;
            color: #3a6ea5;
        }
        .command-description {
            color: #bbb;
            margin-top: 5px;
        }
        .action-button {
            padding: 8px 15px;
            margin-right: 10px;
            background-color: #3a3a3a;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .action-button:hover {
            background-color: #4a4a4a;
        }
        .restart-btn {
            background-color: #ff9800;
        }
        .restart-btn:hover {
            background-color: #ffb74d;
        }
        .shutdown-btn {
            background-color: #f44336;
        }
        .shutdown-btn:hover {
            background-color: #ef5350;
        }
        .start-btn {
            background-color: #4CAF50;
        }
        .start-btn:hover {
            background-color: #66BB6A;
        }
        .button-container {
            margin-top: 15px;
        }
        .mentions-you {
            background-color: rgba(255, 152, 0, 0.2);
            border-left: 3px solid #ff9800;
            padding-left: 10px;
        }
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .dashboard-card {
            background-color: #333;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .dashboard-card h3 {
            margin-top: 0;
            border-bottom: 1px solid #444;
            padding-bottom: 8px;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #4CAF50;
            margin: 10px 0;
        }
        .stat-label {
            color: #aaa;
            font-size: 14px;
        }
        .progress-container {
            margin-top: 10px;
            background-color: #222;
            border-radius: 4px;
            height: 20px;
            overflow: hidden;
        }
        .progress-bar {
            height: 100%;
            background-color: #3a6ea5;
            width: 0%;
            transition: width 0.5s;
        }
        .connection-history {
            max-height: 200px;
            overflow-y: auto;
            margin-top: 10px;
        }
        .connection-event {
            padding: 8px;
            border-bottom: 1px solid #444;
            font-size: 0.9em;
        }
        .connection-time {
            color: #888;
        }
        .connection-state {
            font-weight: bold;
            margin-left: 10px;
        }
        .connection-reason {
            color: #aaa;
            margin-top: 3px;
            font-size: 0.9em;
        }
        .state-connected {
            color: #4CAF50;
        }
        .state-disconnected {
            color: #F44336;
        }
        .state-error {
            color: #ff9800;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>MaxBot Control Panel</h1>
        
        <div class="tabs">
            <button class="tab-button active" data-tab="status">Status</button>
            <button class="tab-button" data-tab="logs">Logs</button>
            <button class="tab-button" data-tab="chat">Chat</button>
            <button class="tab-button" data-tab="commands">Commands</button>
            <button class="tab-button" data-tab="dashboard">Dashboard</button>
        </div>
        
        <div id="status-tab" class="tab-content active">
            <div class="panel">
                <h2>Bot Administration</h2>
                <div>
                    <h3>Bot Status</h3>
                    <div>
                        <p>Current Status: <span id="connection-status">Loading...</span></p>
                        <p>Uptime: <span id="uptime">-</span></p>
                        <p>Process ID: <span id="process-id">-</span></p>
                    </div>
                    
                    <h3>Bot Control</h3>
                    <div class="button-container">
                        <button id="restart-btn" class="action-button restart-btn">🔄 Restart Bot</button>
                        <button id="shutdown-btn" class="action-button shutdown-btn">🛑 Shutdown Bot</button>
                        <button id="start-btn" class="action-button start-btn">▶️ Start Bot</button>
                    </div>
                    <p><a href="/env-editor" style="color: #8ab4f8; text-decoration: none;">⚙️ Edit Environment Variables</a></p>
                    <p class="note">Note: Restarting or shutting down the bot will disconnect it from Twitch chat temporarily.</p>
                    
                    <h3>Connection History</h3>
                    <div id="connection-history" class="connection-history">
                        <p>Loading connection history...</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="logs-tab" class="tab-content">
            <div class="panel">
                <h2>Bot Logs</h2>
                <div id="logs-container">
                    <p>Loading logs...</p>
                </div>
            </div>
        </div>
        
        <div id="chat-tab" class="tab-content">
            <div class="panel">
                <h2>Twitch Chat</h2>
                <div class="chat-container" id="chat-container">
                    <p>Loading chat messages...</p>
                </div>
                <div class="chat-input-container">
                    <input type="text" id="chat-input" class="chat-input" placeholder="Type a message...">
                    <button id="chat-send-btn" class="chat-send-btn">Send</button>
                </div>
            </div>
        </div>
        
        <div id="commands-tab" class="tab-content">
            <div class="panel">
                <h2>Bot Commands</h2>
                <div id="commands-container">
                    <p>Loading commands...</p>
                </div>
                <div class="chat-input-container">
                    <input type="text" id="command-input" class="chat-input" placeholder="Type a command to execute...">
                    <button id="command-execute-btn" class="chat-send-btn">Execute</button>
                </div>
            </div>
        </div>
        
        <div id="dashboard-tab" class="tab-content">
            <div class="panel">
                <h2>Bot Dashboard</h2>
                
                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Bot Status</h3>
                        <div class="stat-value" id="dashboard-status">Disconnected</div>
                        <div class="stat-label">Current Connection Status</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Messages Received</h3>
                        <div class="stat-value" id="messages-received">0</div>
                        <div class="stat-label">Total Chat Messages Received</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Messages Sent</h3>
                        <div class="stat-value" id="messages-sent">0</div>
                        <div class="stat-label">Total Messages Sent by Bot</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Commands Executed</h3>
                        <div class="stat-value" id="commands-executed">0</div>
                        <div class="stat-label">Total Commands Processed</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Reconnections</h3>
                        <div class="stat-value" id="reconnections">0</div>
                        <div class="stat-label">Number of Reconnection Attempts</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Errors</h3>
                        <div class="stat-value" id="errors">0</div>
                        <div class="stat-label">Total Error Count</div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Memory Usage</h3>
                        <div class="stat-value" id="memory-usage">0 MB</div>
                        <div class="stat-label">Current Memory Consumption</div>
                        <div class="progress-container">
                            <div class="progress-bar" id="memory-bar"></div>
                        </div>
                    </div>
                    
                    <div class="dashboard-card">
                        <h3>Control Panel</h3>
                        <div class="stat-value" id="chat-messages-sent">0</div>
                        <div class="stat-label">Messages Sent from Panel</div>
                    </div>
                </div>
                
                <div class="dashboard-card">
                    <h3>Recent Connection Events</h3>
                    <div id="dashboard-connection-history" class="connection-history">
                        <p>Loading connection history...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Global variables
        let ws = null;
        const appState = {
            logs: [],
            chat: [],
            status: {
                connected: false,
                uptime: null,
                pid: null
            },
            stats: {
                messagesReceived: 0,
                messagesSent: 0,
                reconnections: 0,
                commandsExecuted: 0,
                chatMessagesSent: 0,
                errors: 0,
                connectionHistory: []
            }
        };
        
        // Function to connect to WebSocket
        function connectToWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws';
            
            console.log('Connecting to WebSocket at', wsUrl);
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                console.log('WebSocket connection established');
                // Request initial status
                ws.send(JSON.stringify({ type: 'REQUEST_STATUS' }));
            };
            
            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'STATUS') {
                        appState.status = {
                            ...appState.status,
                            ...data.status
                        };
                        updateStatus();
                    } else if (data.type === 'LOG') {
                        appState.logs.push({
                            time: data.time || new Date().toISOString(),
                            message: data.message
                        });
                        
                        // Limit logs to 1000 entries
                        if (appState.logs.length > 1000) {
                            appState.logs.shift();
                        }
                        
                        updateLogs();
                    } else if (data.type === 'CHAT') {
                        appState.chat.push({
                            time: data.time || new Date().toISOString(),
                            username: data.username,
                            message: data.message,
                            badges: data.badges || {}
                        });
                        
                        // Limit chat to 200 entries
                        if (appState.chat.length > 200) {
                            appState.chat.shift();
                        }
                        
                        updateChat();
                    } else if (data.type === 'STATS') {
                        appState.stats = {
                            ...appState.stats,
                            ...data.stats
                        };
                        updateDashboard();
                    }
                } catch (error) {
                    console.error('Error handling WebSocket message:', error);
                }
            };
            
            ws.onclose = function() {
                console.log('WebSocket connection closed');
                ws = null;
                
                // Update UI to show disconnected state
                appState.status.connected = false;
                updateStatus();
                
                // Try to reconnect after a delay
                setTimeout(connectToWebSocket, 5000);
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }
        
        // Function to update status display
        function updateStatus() {
            const statusElement = document.getElementById('connection-status');
            const uptimeElement = document.getElementById('uptime');
            const pidElement = document.getElementById('process-id');
            
            if (appState.status.connected) {
                statusElement.innerHTML = '<span class="status-indicator status-connected"></span>Connected';
                uptimeElement.textContent = appState.status.uptime || '-';
                pidElement.textContent = appState.status.pid || '-';
            } else {
                statusElement.innerHTML = '<span class="status-indicator status-disconnected"></span>Disconnected';
                uptimeElement.textContent = '-';
                pidElement.textContent = '-';
            }
            
            // Update connection history
            updateConnectionHistory();
        }
        
        // Function to update logs display
        function updateLogs() {
            const logsContainer = document.getElementById('logs-container');
            
            if (appState.logs.length === 0) {
                logsContainer.innerHTML = '<p>No logs available.</p>';
                return;
            }
            
            let logsHtml = '';
            
            // Display logs in reverse chronological order (newest first)
            for (let i = appState.logs.length - 1; i >= 0; i--) {
                const log = appState.logs[i];
                logsHtml += \`
                    <div class="log-entry">
                        <span class="log-time">\${new Date(log.time).toLocaleTimeString()}</span>
                        <span class="log-message">\${log.message}</span>
                    </div>
                \`;
            }
            
            logsContainer.innerHTML = logsHtml;
        }
        
        // Function to update chat display
        function updateChat() {
            const chatContainer = document.getElementById('chat-container');
            
            if (appState.chat.length === 0) {
                chatContainer.innerHTML = '<p>No chat messages available.</p>';
                return;
            }
            
            let chatHtml = '';
            
            for (const message of appState.chat) {
                // Check if the message mentions the bot
                const isMention = message.message.toLowerCase().includes(appState.status.username?.toLowerCase() || '');
                
                // Create badges HTML
                let badgesHtml = '';
                if (message.badges) {
                    for (const [type, version] of Object.entries(message.badges)) {
                        badgesHtml += \`<span class="chat-badge \${type}-badge">\${type}</span>\`;
                    }
                }
                
                chatHtml += \`
                    <div class="chat-entry">
                        <span class="chat-username">\${message.username}</span>
                        <span class="chat-message">\${message.message}</span>
                    </div>
                \`;
            }
            
            chatContainer.innerHTML = chatHtml;
        }
        
        // Function to update dashboard display
        function updateDashboard() {
            const statusElement = document.getElementById('dashboard-status');
            const messagesReceivedElement = document.getElementById('messages-received');
            const messagesSentElement = document.getElementById('messages-sent');
            const commandsExecutedElement = document.getElementById('commands-executed');
            const reconnectionsElement = document.getElementById('reconnections');
            const errorsElement = document.getElementById('errors');
            const memoryUsageElement = document.getElementById('memory-usage');
            const chatMessagesSentElement = document.getElementById('chat-messages-sent');
            
            statusElement.textContent = appState.status.connected ? 'Connected' : 'Disconnected';
            messagesReceivedElement.textContent = appState.stats.messagesReceived;
            messagesSentElement.textContent = appState.stats.messagesSent;
            commandsExecutedElement.textContent = appState.stats.commandsExecuted;
            reconnectionsElement.textContent = appState.stats.reconnections;
            errorsElement.textContent = appState.stats.errors;
            memoryUsageElement.textContent = \`\${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\`;
            chatMessagesSentElement.textContent = appState.stats.chatMessagesSent;
            
            // Update connection history
            updateConnectionHistory();
        }
        
        // Function to update connection history
        function updateConnectionHistory() {
            const connectionHistoryElement = document.getElementById('connection-history');
            const dashboardConnectionHistoryElement = document.getElementById('dashboard-connection-history');
            
            if (appState.stats.connectionHistory.length === 0) {
                connectionHistoryElement.innerHTML = '<p>No connection history available.</p>';
                dashboardConnectionHistoryElement.innerHTML = '<p>No connection history available.</p>';
                return;
            }
            
            let connectionHistoryHtml = '';
            let dashboardConnectionHistoryHtml = '';
            
            // Display connection history in reverse chronological order (newest first)
            for (let i = appState.stats.connectionHistory.length - 1; i >= 0; i--) {
                const event = appState.stats.connectionHistory[i];
                connectionHistoryHtml += \`
                    <div class="connection-event">
                        <span class="connection-time">\${new Date(event.time).toLocaleTimeString()}</span>
                        <span class="connection-state \${event.state.toLowerCase().replace(' ', '-')}">\${event.state}</span>
                        <span class="connection-reason">\${event.reason}</span>
                    </div>
                \`;
                
                dashboardConnectionHistoryHtml += \`
                    <div class="connection-event">
                        <span class="connection-time">\${new Date(event.time).toLocaleTimeString()}</span>
                        <span class="connection-state \${event.state.toLowerCase().replace(' ', '-')}">\${event.state}</span>
                        <span class="connection-reason">\${event.reason}</span>
                    </div>
                \`;
            }
            
            connectionHistoryElement.innerHTML = connectionHistoryHtml;
            dashboardConnectionHistoryElement.innerHTML = dashboardConnectionHistoryHtml;
        }
    </script>
</body>
</html>
`;

  res.send(htmlTemplate);
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 