#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Finding and killing MaxBot-tui processes...');

// Create a PID file to store the current process ID
const createPidFile = () => {
    try {
        const pidFile = path.join(__dirname, 'maxbot-tui.pid');
        fs.writeFileSync(pidFile, process.pid.toString());
        console.log(`PID file created at ${pidFile}`);
        return pidFile;
    } catch (error) {
        console.error('Error creating PID file:', error);
        return null;
    }
};

// Read the PID file if it exists
const readPidFile = () => {
    try {
        const pidFile = path.join(__dirname, 'maxbot-tui.pid');
        if (fs.existsSync(pidFile)) {
            const pid = fs.readFileSync(pidFile, 'utf8').trim();
            return pid;
        }
    } catch (error) {
        console.error('Error reading PID file:', error);
    }
    return null;
};

// Kill the process with the given PID
const killProcess = (pid) => {
    try {
        console.log(`Attempting to kill process ${pid}...`);
        execSync(`kill -9 ${pid}`);
        console.log(`Process ${pid} killed successfully.`);
        return true;
    } catch (error) {
        console.error(`Error killing process ${pid}:`, error.message);
        return false;
    }
};

// Find and kill all MaxBot-tui processes
const findAndKillProcesses = () => {
    try {
        console.log('Searching for MaxBot-tui processes...');
        const output = execSync('ps aux | grep node').toString();
        
        const lines = output.split('\n').filter(line => 
            line.includes('MaxBot-tui') && 
            !line.includes('grep') && 
            !line.includes('exit-maxbot.js')
        );
        
        if (lines.length === 0) {
            console.log('No MaxBot-tui processes found.');
            return false;
        }
        
        console.log(`Found ${lines.length} MaxBot-tui processes.`);
        
        let success = false;
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];
            success = killProcess(pid) || success;
        }
        
        return success;
    } catch (error) {
        console.error('Error finding processes:', error.message);
        return false;
    }
};

// Main function
const main = () => {
    // First try to kill using the PID file
    const pid = readPidFile();
    if (pid) {
        console.log(`Found PID file with process ID: ${pid}`);
        if (killProcess(pid)) {
            console.log('Successfully killed MaxBot-tui process using PID file.');
            return;
        }
    }
    
    // If that fails, try to find and kill all matching processes
    if (findAndKillProcesses()) {
        console.log('Successfully killed MaxBot-tui processes.');
    } else {
        console.log('Failed to kill any MaxBot-tui processes.');
    }
};

// Run the main function
main(); 