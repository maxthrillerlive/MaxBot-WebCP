#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Path to the .env file
const envPath = path.join(__dirname, '..', 'MaxBot', '.env');
const samplePath = path.join(__dirname, '..', 'MaxBot', '.env.sample');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to read the .env file
function readEnvFile() {
  try {
    if (fs.existsSync(envPath)) {
      return fs.readFileSync(envPath, 'utf8');
    } else if (fs.existsSync(samplePath)) {
      return fs.readFileSync(samplePath, 'utf8');
    } else {
      return '# Bot Configuration\n' +
             'BOT_USERNAME=your_bot_username\n' +
             'CHANNEL_NAME=your_channel\n' +
             'OAUTH_TOKEN=oauth:your_token_here\n' +
             'PREFIX=!\n' +
             '# Add other configuration variables as needed';
    }
  } catch (error) {
    console.error('Error reading .env file:', error.message);
    return '';
  }
}

// Function to write the .env file
function writeEnvFile(content) {
  try {
    // Create a backup of the current .env file
    if (fs.existsSync(envPath)) {
      const backupPath = path.join(__dirname, '..', 'MaxBot', `.env.backup.${Date.now()}`);
      fs.copyFileSync(envPath, backupPath);
      console.log(`Created backup of .env file at ${backupPath}`);
    }
    
    // Write the new content
    fs.writeFileSync(envPath, content);
    console.log('Environment variables updated successfully');
    return true;
  } catch (error) {
    console.error('Error writing .env file:', error.message);
    return false;
  }
}

// Function to display the menu
function showMenu() {
  console.clear();
  console.log('=== MaxBot Environment Editor ===');
  console.log('1. View current configuration');
  console.log('2. Edit configuration');
  console.log('3. Exit');
  rl.question('Select an option (1-3): ', handleMenuChoice);
}

// Function to handle menu choices
function handleMenuChoice(choice) {
  switch (choice) {
    case '1':
      viewConfig();
      break;
    case '2':
      editConfig();
      break;
    case '3':
      console.log('Exiting...');
      rl.close();
      break;
    default:
      console.log('Invalid choice. Please try again.');
      setTimeout(showMenu, 1000);
      break;
  }
}

// Function to view the current configuration
function viewConfig() {
  console.clear();
  console.log('=== Current Configuration ===');
  const content = readEnvFile();
  console.log(content);
  console.log('\n');
  rl.question('Press Enter to return to the menu...', showMenu);
}

// Function to edit the configuration
function editConfig() {
  console.clear();
  console.log('=== Edit Configuration ===');
  console.log('Enter your configuration below. Press Ctrl+D (Unix) or Ctrl+Z (Windows) followed by Enter when done.');
  console.log('Current configuration:');
  
  const currentContent = readEnvFile();
  console.log(currentContent);
  console.log('\n=== Enter new configuration (or copy and modify the above) ===');
  
  // Collect lines of input
  let newContent = '';
  const inputRL = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
  });
  
  inputRL.prompt();
  
  inputRL.on('line', (line) => {
    newContent += line + '\n';
  });
  
  inputRL.on('close', () => {
    if (newContent.trim()) {
      console.log('\nSaving new configuration...');
      if (writeEnvFile(newContent)) {
        console.log('Configuration saved successfully!');
      }
    } else {
      console.log('\nNo changes made.');
    }
    
    setTimeout(() => {
      rl.question('Press Enter to return to the menu...', showMenu);
    }, 1000);
  });
}

// Start the application
showMenu();

// Handle exit
rl.on('close', () => {
  console.log('Thank you for using MaxBot Environment Editor!');
  process.exit(0);
}); 