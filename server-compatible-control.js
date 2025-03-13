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

// Add a route to serve the environment editor page
app.get('/env-editor', (req, res) => {
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaxBot Environment Editor</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #1a1a1a;
      color: #f0f0f0;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: #ddd;
      margin-top: 0;
      border-bottom: 1px solid #444;
      padding-bottom: 10px;
    }
    .info-text {
      color: #8ab4f8;
      margin-bottom: 15px;
    }
    .editor-container {
      margin: 15px 0;
      border: 1px solid #444;
      border-radius: 4px;
      background-color: #1e1e1e;
    }
    #env-editor {
      width: 100%;
      min-height: 300px;
      padding: 10px;
      font-family: monospace;
      background-color: #1e1e1e;
      color: #f0f0f0;
      border: none;
      resize: vertical;
      box-sizing: border-box;
    }
    .button-container {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }
    .action-button {
      padding: 8px 16px;
      background-color: #3a3a3a;
      color: #f0f0f0;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    .action-button:hover {
      background-color: #4a4a4a;
    }
    .save-button {
      background-color: #2c5282;
    }
    .save-button:hover {
      background-color: #3a6ea5;
    }
    .help-section {
      margin-top: 20px;
      padding: 15px;
      background-color: #222;
      border-radius: 4px;
    }
    .help-section h2 {
      margin-top: 0;
      color: #ddd;
      font-size: 18px;
    }
    .help-section ul {
      padding-left: 20px;
    }
    .help-section li {
      margin-bottom: 8px;
    }
    .warning-text {
      color: #ffcc00;
      font-weight: bold;
    }
    .back-link {
      display: inline-block;
      margin-top: 20px;
      color: #8ab4f8;
      text-decoration: none;
    }
    .back-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MaxBot Environment Editor</h1>
    <p class="info-text">Edit your bot's configuration. Changes will require a bot restart to take effect.</p>
    
    <div class="editor-container">
      <textarea id="env-editor" rows="15"></textarea>
    </div>
    
    <div class="button-container">
      <button id="save-env-btn" class="action-button save-button">💾 Save Configuration</button>
      <button id="reload-env-btn" class="action-button">🔄 Reload</button>
      <button id="back-btn" class="action-button">⬅️ Back to Control Panel</button>
    </div>
    
    <div class="help-section">
      <h2>Common Configuration Variables</h2>
      <ul>
        <li><strong>BOT_USERNAME</strong>: Your bot's Twitch username</li>
        <li><strong>CHANNEL_NAME</strong>: The Twitch channel where the bot will operate</li>
        <li><strong>OAUTH_TOKEN</strong>: Your bot's OAuth token (get from <a href="https://twitchapps.com/tmi/" target="_blank" style="color: #8ab4f8;">https://twitchapps.com/tmi/</a>)</li>
        <li><strong>PREFIX</strong>: Command prefix (usually "!")</li>
      </ul>
      <p class="warning-text">⚠️ After saving, you'll need to restart the bot for changes to take effect.</p>
    </div>
    
    <a href="/" class="back-link">← Return to Control Panel</a>
  </div>

  <script>
    // Function to load environment variables
    function loadEnvVariables() {
      fetch('/api/admin/env')
        .then(response => response.json())
        .then(data => {
          if (data.content) {
            document.getElementById('env-editor').value = data.content;
          }
        })
        .catch(error => {
          console.error('Error loading environment variables:', error);
          alert('Failed to load environment variables: ' + error.message);
        });
    }

    // Function to save environment variables
    function saveEnvVariables() {
      const envEditor = document.getElementById('env-editor');
      if (confirm('Are you sure you want to save these changes? This will update your bot configuration.')) {
        fetch('/api/admin/env', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ content: envEditor.value })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Configuration saved successfully! Restart the bot for changes to take effect.');
          } else {
            alert('Error: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(error => {
          console.error('Error saving environment variables:', error);
          alert('Failed to save configuration: ' + error.message);
        });
      }
    }

    // Initialize the page
    document.addEventListener('DOMContentLoaded', function() {
      // Load environment variables when the page loads
      loadEnvVariables();
      
      // Set up button event listeners
      document.getElementById('save-env-btn').addEventListener('click', saveEnvVariables);
      
      document.getElementById('reload-env-btn').addEventListener('click', function() {
        if (confirm('Reload the current configuration? Any unsaved changes will be lost.')) {
          loadEnvVariables();
        }
      });
      
      document.getElementById('back-btn').addEventListener('click', function() {
        window.location.href = '/';
      });
    });
  </script>
</body>
</html>
  `;
  
  res.send(htmlTemplate);
});

// Add API endpoints for environment variables
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
        .note {
            font-style: italic;
            color: #aaa;
            margin-top: 10px;
        }
        .env-link {
            display: inline-block;
            margin-top: 10px;
            color: #8ab4f8;
            text-decoration: none;
        }
        .env-link:hover {
            text-decoration: underline;
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
                    <p><a href="/env-editor" class="env-link">⚙️ Edit Environment Variables</a></p>
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
                        <div class="stat-label">Total Commands Executed</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Function to load environment variables
        function loadEnvVariables() {
            fetch('/api/admin/env')
                .then(response => response.json())
                .then(data => {
                    if (data.content) {
                        document.getElementById('env-editor').value = data.content;
                    }
                })
                .catch(error => {
                    console.error('Error loading environment variables:', error);
                    alert('Failed to load environment variables: ' + error.message);
                });
        }

        // Function to save environment variables
        function saveEnvVariables() {
            const envEditor = document.getElementById('env-editor');
            if (confirm('Are you sure you want to save these changes? This will update your bot configuration.')) {
                fetch('/api/admin/env', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: envEditor.value })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Configuration saved successfully! Restart the bot for changes to take effect.');
                    } else {
                        alert('Error: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(error => {
                    console.error('Error saving environment variables:', error);
                    alert('Failed to save configuration: ' + error.message);
                });
            }
        }

        // Initialize the page
        document.addEventListener('DOMContentLoaded', function() {
            // Load environment variables when the page loads
            loadEnvVariables();
            
            // Set up button event listeners
            document.getElementById('save-env-btn').addEventListener('click', saveEnvVariables);
            
            document.getElementById('reload-env-btn').addEventListener('click', function() {
                if (confirm('Reload the current configuration? Any unsaved changes will be lost.')) {
                    loadEnvVariables();
                }
            });
            
            document.getElementById('back-btn').addEventListener('click', function() {
                window.location.href = '/';
            });
        });
    </script>
</body>
</html>
  `;
  
  res.send(htmlTemplate);
});