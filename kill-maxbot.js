#!/usr/bin/env node

// Simple script to find and kill MaxBot-tui processes
const { execSync } = require('child_process');

console.log('Searching for MaxBot-tui processes...');

try {
  // Find all Node.js processes
  const psOutput = execSync('ps aux | grep node').toString();
  
  // Look for MaxBot-tui processes
  const lines = psOutput.split('\n').filter(line => 
    line.includes('MaxBot-tui') && !line.includes('grep') && !line.includes('kill-maxbot.js')
  );
  
  if (lines.length === 0) {
    console.log('No MaxBot-tui processes found.');
    return;
  }
  
  console.log(`Found ${lines.length} MaxBot-tui processes:`);
  
  // Extract PIDs and try to kill each process
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[1];
    
    console.log(`Attempting to kill process ${pid}: ${line.substring(0, 100)}...`);
    
    try {
      // Try SIGTERM first
      console.log(`Sending SIGTERM to ${pid}...`);
      execSync(`kill ${pid}`);
      console.log(`SIGTERM sent to ${pid}`);
      
      // Check if process is still running
      setTimeout(() => {
        try {
          const stillRunning = execSync(`ps -p ${pid}`).toString().includes(pid);
          if (stillRunning) {
            console.log(`Process ${pid} still running, trying SIGKILL...`);
            execSync(`kill -9 ${pid}`);
            console.log(`SIGKILL sent to ${pid}`);
          } else {
            console.log(`Process ${pid} successfully terminated`);
          }
        } catch (e) {
          console.log(`Process ${pid} no longer exists (already terminated)`);
        }
      }, 1000);
    } catch (e) {
      console.error(`Error killing process ${pid}:`, e.message);
      console.log('Trying SIGKILL...');
      try {
        execSync(`kill -9 ${pid}`);
        console.log(`SIGKILL sent to ${pid}`);
      } catch (e2) {
        console.error(`Failed to kill process ${pid} with SIGKILL:`, e2.message);
      }
    }
  }
  
  console.log('Kill operations completed. Check if processes are still running with:');
  console.log('  ps aux | grep MaxBot-tui');
  
} catch (error) {
  console.error('Error:', error.message);
} 