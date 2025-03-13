// Console Panel Module
const blessed = require('blessed');

class ConsolePanel {
  constructor(grid, row, col, rowSpan, colSpan) {
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.log, {
      label: ' Console ',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'cyan'
        },
        style: {
          inverse: true
        }
      },
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      },
      keys: true,
      vi: true,
      mouse: true
    });
  }

  log(message) {
    try {
      // Get current content
      const content = this.panel.getContent();
      
      // Add new message
      this.panel.setContent(content + '\n' + message);
      
      // Scroll to bottom
      this.panel.setScrollPerc(100);
    } catch (error) {
      console.error('Error logging to console panel:', error);
    }
  }

  clear() {
    this.panel.setContent('');
  }
}

module.exports = ConsolePanel; 