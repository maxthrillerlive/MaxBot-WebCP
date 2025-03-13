#!/usr/bin/env node

// First, log that we're starting
console.log('Starting blessed test in MaxBot-tui...');

// Try to require blessed
try {
  const blessed = require('blessed');
  console.log('Successfully required blessed module');
  
  // Try to create a screen
  try {
    const screen = blessed.screen({
      smartCSR: true,
      title: 'MaxBot-tui Blessed Test'
    });
    console.log('Successfully created screen');
    
    // Try to create a box
    try {
      const box = blessed.box({
        top: 'center',
        left: 'center',
        width: '50%',
        height: '50%',
        content: 'Blessed is working in MaxBot-tui!',
        border: {
          type: 'line'
        },
        style: {
          fg: 'white',
          bg: 'black',
          border: {
            fg: 'white'
          }
        }
      });
      console.log('Successfully created box');
      
      // Try to append the box to the screen
      try {
        screen.append(box);
        console.log('Successfully appended box to screen');
        
        // Try to render the screen
        try {
          screen.render();
          console.log('Successfully rendered screen');
          
          // Set up exit key
          screen.key(['escape', 'q', 'C-c'], function() {
            console.log('Exit key pressed');
            process.exit(0);
          });
          
          // Auto-exit after 5 seconds
          setTimeout(() => {
            console.log('Auto-exit timeout reached');
            process.exit(0);
          }, 5000);
          
          console.log('Test completed successfully');
        } catch (e) {
          console.error('Error rendering screen:', e);
        }
      } catch (e) {
        console.error('Error appending box to screen:', e);
      }
    } catch (e) {
      console.error('Error creating box:', e);
    }
  } catch (e) {
    console.error('Error creating screen:', e);
  }
} catch (e) {
  console.error('Error requiring blessed module:', e);
} 