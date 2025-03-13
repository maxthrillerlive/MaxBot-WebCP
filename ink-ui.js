#!/usr/bin/env node
const React = require('react');
const { render, Box, Text, useInput, useApp } = require('ink');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Clean up function
const cleanup = () => {
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log('PID file removed');
    }
  } catch (e) {
    // Ignore errors
  }
};

// Handle exit events
process.on('exit', cleanup);
process.on('SIGINT', () => {
  console.log('SIGINT received');
  cleanup();
  process.exit(0);
});

// Main App component
const App = () => {
  const { exit } = useApp();
  const [status, setStatus] = React.useState('Disconnected');
  const [logs, setLogs] = React.useState([]);
  const [timeLeft, setTimeLeft] = React.useState(30);
  
  // Auto-exit timer
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          console.log('Auto-exit timeout reached');
          clearInterval(timer);
          exit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // WebSocket connection
  React.useEffect(() => {
    try {
      // Get server URL from environment variables or use default
      const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
      const port = process.env.WEBSOCKET_PORT || '8080';
      const serverUrl = `ws://${host}:${port}`;
      
      addLog(`Connecting to WebSocket server at: ${serverUrl}`);
      
      const ws = new WebSocket(serverUrl, {
        handshakeTimeout: 5000 // 5 seconds
      });
      
      ws.on('open', () => {
        addLog('Connected to WebSocket server');
        setStatus('Connected');
      });
      
      ws.on('error', (error) => {
        addLog(`WebSocket error: ${error.message}`);
        setStatus('Error');
      });
      
      ws.on('close', () => {
        addLog('Disconnected from WebSocket server');
        setStatus('Disconnected');
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          addLog(`Received message of type: ${message.type}`);
        } catch (error) {
          addLog(`Error processing message: ${error.message}`);
        }
      });
      
      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
    } catch (error) {
      addLog(`Error creating WebSocket connection: ${error.message}`);
    }
  }, []);
  
  // Add log message
  const addLog = (message) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-10));
  };
  
  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q' || (key.ctrl && input === 'c')) {
      console.log('Exit key pressed');
      exit();
    }
  });
  
  return (
    <Box flexDirection="column" width={80} height={24} borderStyle="round" borderColor="blue">
      <Box borderStyle="single" borderColor="blue" height={3} flexDirection="column">
        <Text bold color="blue"> Bot Status </Text>
        <Text>Status: <Text color={status === 'Connected' ? 'green' : 'red'}>{status}</Text></Text>
      </Box>
      
      <Box borderStyle="single" borderColor="yellow" height={12} flexDirection="column" marginTop={1}>
        <Text bold color="yellow"> Console </Text>
        {logs.map((log, i) => (
          <Text key={i}>{log}</Text>
        ))}
      </Box>
      
      <Box borderStyle="single" borderColor="red" height={5} flexDirection="column" marginTop={1}>
        <Text bold color="red"> Exit Application </Text>
        <Text>Press <Text color="green" bold>Q</Text>, <Text color="green" bold>Escape</Text>, or <Text color="green" bold>Ctrl+C</Text> to exit</Text>
        <Text>Application will automatically exit in <Text color="yellow" bold>{timeLeft}</Text> seconds</Text>
      </Box>
    </Box>
  );
};

// Render the app
render(<App />); 