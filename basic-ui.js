#!/usr/bin/env node

const blessed = require('blessed');

// Create a screen object
const screen = blessed.screen({
  smartCSR: true,
  title: 'Basic MaxBot UI'
});

// Create a box
const box = blessed.box({
  top: 'center',
  left: 'center',
  width: '80%',
  height: '50%',
  content: 'Press any key to exit\n\nThis is a basic test of the blessed library.',
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: '#f0f0f0'
    }
  }
});

// Append the box to the screen
screen.append(box);

// Quit on any key
screen.key(['escape', 'q', 'C-c', 'enter'], function() {
  console.log('Exiting application');
  return process.exit(0);
});

// Auto-exit after 10 seconds
setTimeout(() => {
  console.log('Auto-exit timeout reached');
  process.exit(0);
}, 10000);

// Focus our box
box.focus();

// Render the screen
screen.render();

console.log('Basic UI started'); 