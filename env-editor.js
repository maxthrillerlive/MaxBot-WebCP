const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create Express app
const app = express();
const port = 3001; // Use a different port than your main app

// Middleware for parsing JSON
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Serve static HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'env-editor.html'));
});

// API endpoint to get environment variables
app.get('/api/env', (req, res) => {
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

// API endpoint to save environment variables
app.post('/api/env', (req, res) => {
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

// Start the server
server.listen(port, () => {
  console.log(`Environment Editor server running at http://localhost:${port}`);
}); 