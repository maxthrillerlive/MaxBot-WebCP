#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting MaxBot TUI with watchdog...');

// Function to start the application
function startApp() {
    console.log('Launching MaxBot TUI...');
    
    // Start the application
    const app = spawn('node', [path.join(__dirname, 'src', 'index.js')], {
        stdio: 'inherit'
    });
    
    // Handle exit
    app.on('exit', (code, signal) => {
        console.log(`MaxBot TUI exited with code ${code} and signal ${signal}`);
        
        // Clean up any resources
        console.log('Cleaning up...');
        
        // Exit the watchdog
        process.exit(0);
    });
    
    // Handle errors
    app.on('error', (error) => {
        console.error('Error starting MaxBot TUI:', error);
        process.exit(1);
    });
    
    // Set up a watchdog timer - much shorter now
    const watchdogTimer = setTimeout(() => {
        console.log('Watchdog timer expired, killing application');
        app.kill('SIGKILL');
    }, 20 * 1000); // 20 seconds
    
    // Clear the watchdog timer if the process exits normally
    app.on('exit', () => {
        clearTimeout(watchdogTimer);
    });
    
    // Handle signals
    process.on('SIGINT', () => {
        console.log('Received SIGINT, shutting down...');
        app.kill('SIGTERM');
        setTimeout(() => {
            console.log('Forcing exit...');
            app.kill('SIGKILL');
            process.exit(1);
        }, 3000); // Give it 3 seconds to exit gracefully
    });
    
    process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down...');
        app.kill('SIGTERM');
        setTimeout(() => {
            console.log('Forcing exit...');
            app.kill('SIGKILL');
            process.exit(1);
        }, 3000); // Give it 3 seconds to exit gracefully
    });
}

// Start the application
startApp(); 