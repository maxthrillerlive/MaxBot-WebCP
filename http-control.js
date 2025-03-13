#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Clean up on exit
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

// Create HTTP server
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  
  if (req.url === '/exit') {
    res.write('<html><body><h1>MaxBot TUI is shutting down...</h1></body></html>');
    res.end();
    console.log('Exit command received via HTTP');
    setTimeout(() => {
      process.exit(0);
    }, 500);
    return;
  }
  
  if (req.url === '/status') {
    const status = {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(status, null, 2));
    res.end();
    return;
  }
  
  // Default page
  res.write(`
    <html>
    <head>
      <title>MaxBot TUI Control</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .button { 
          display: inline-block; 
          background-color: #f44336; 
          color: white; 
          padding: 14px 20px; 
          margin: 8px 0; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer; 
          font-size: 16px;
        }
        .button:hover { background-color: #d32f2f; }
        .info { background-color: #f1f1f1; padding: 10px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>MaxBot TUI Control Panel</h1>
      <div class="info">
        <p>Process ID: ${process.pid}</p>
        <p>Uptime: ${process.uptime().toFixed(2)} seconds</p>
        <p>Started at: ${new Date(Date.now() - process.uptime() * 1000).toISOString()}</p>
      </div>
      <p>Use this page to control the MaxBot TUI application.</p>
      <a href="/exit" class="button">Exit Application</a>
      <a href="/status" class="button" style="background-color: #2196F3;">Get Status (JSON)</a>
      <script>
        // Auto-refresh the page every 5 seconds
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      </script>
    </body>
    </html>
  `);
  res.end();
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`HTTP control server running at http://localhost:${PORT}`);
  console.log(`To exit the application, visit http://localhost:${PORT}/exit`);
});

// Set up a safety timeout to force exit after 5 minutes
console.log('Setting up safety timeout (5 minutes)');
setTimeout(() => {
  console.log('Safety timeout reached, forcing exit');
  process.exit(0);
}, 5 * 60 * 1000);

// Log startup
console.log('MaxBot TUI HTTP Control started'); 