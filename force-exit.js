#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('Searching for MaxBot-tui processes...');

try {
    // Find all Node.js processes
    const output = execSync('ps aux | grep node').toString();
    
    // Look for MaxBot-tui processes
    const lines = output.split('\n').filter(line => 
        line.includes('MaxBot-tui') && !line.includes('grep') && !line.includes('force-exit.js')
    );
    
    if (lines.length === 0) {
        console.log('No MaxBot-tui processes found.');
        return;
    }
    
    console.log(`Found ${lines.length} MaxBot-tui processes. Killing them...`);
    
    // Kill each process
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        
        console.log(`Killing process ${pid}`);
        try {
            execSync(`kill -9 ${pid}`);
            console.log(`Process ${pid} killed.`);
        } catch (error) {
            console.error(`Error killing process ${pid}:`, error.message);
        }
    }
    
    console.log('All MaxBot-tui processes should be terminated.');
    
} catch (error) {
    console.error('Error:', error.message);
} 