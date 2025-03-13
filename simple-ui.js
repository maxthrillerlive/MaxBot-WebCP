#!/usr/bin/env node

const blessed = require('blessed');

// Create a screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'Simple MaxBot UI'
});

// Create a box
const box = blessed.box({
  top: 'center',
  left: 'center',
  width: '80%',
  height: '50%',
  content: 'Press ANY key to exit immediately',
  tags: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'red',
    border: {
      fg: 'white'
    },
    bold: true
  }
});

// Add the box to the screen
screen.append(box);

// Focus on the box
box.focus();

// Quit on any key
screen.key(['escape', 'q', 'Q', 'C-c', 'x', 'X', 'enter', 'space', 'return'], function() {
  console.log('Exit key pressed, terminating immediately');
  process.exit(0);
});

// Also quit on any key press in the box
box.on('keypress', function() {
  console.log('Key pressed in box, terminating immediately');
  process.exit(0);
});

// Also quit on mouse click
box.on('click', function() {
  console.log('Box clicked, terminating immediately');
  process.exit(0);
});

// Set a very short timeout to exit automatically
setTimeout(() => {
  console.log('Timeout reached, terminating automatically');
  process.exit(0);
}, 5000); // 5 seconds

// Render the screen
screen.render();

console.log('Simple UI started. Press ANY key to exit or wait 5 seconds for automatic exit.'); 