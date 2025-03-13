// Status Panel Module
const blessed = require('blessed');

class StatusPanel {
  constructor(grid, row, col, rowSpan, colSpan) {
    console.log('Creating StatusPanel');
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.box, {
      label: ' Bot Status ',
      tags: true,
      content: 'Initializing...',
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      }
    });
    
    // Set initial content directly
    this.panel.setContent('Status: Waiting for connection...');
  }

  updateStatus(status) {
    try {
      console.log('StatusPanel.updateStatus called with:', JSON.stringify(status));
      
      // Very simple content update
      this.panel.setContent(
        `Status: ${status.connected ? 'Connected' : 'Disconnected'}\n` +
        `Channel: ${status.channel || 'Unknown'}\n` +
        `Uptime: ${status.uptime || 0}s`
      );
      
      console.log('Status panel content updated');
    } catch (error) {
      console.error('Error updating status panel:', error);
    }
  }
}

module.exports = StatusPanel; 