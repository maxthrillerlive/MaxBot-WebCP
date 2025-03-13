// Simplify the StatusPanel class to display hardcoded information
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
    
    // Set hardcoded status information
    this.setHardcodedStatus();
    
    // Update status every 5 seconds to show it's working
    setInterval(() => {
      this.setHardcodedStatus();
    }, 5000);
  }
  
  setHardcodedStatus() {
    try {
      // Get current time for uptime simulation
      const uptime = Math.floor(process.uptime());
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;
      const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
      
      // Set hardcoded content
      this.panel.setContent(
        `{bold}Connection:{/bold} {green-fg}Connected{/green-fg}\n` +
        `{bold}Channel:{/bold} #maxthriller\n` +
        `{bold}Uptime:{/bold} ${uptimeStr}\n` +
        `{bold}Username:{/bold} Max2d2\n` +
        `{bold}Process ID:{/bold} ${process.pid}\n` +
        `{bold}Last Updated:{/bold} ${new Date().toLocaleTimeString()}`
      );
      
      // Force render
      if (this.panel.screen) {
        this.panel.screen.render();
      }
      
      console.log('Hardcoded status updated');
    } catch (error) {
      console.error('Error setting hardcoded status:', error);
    }
  }
  
  updateStatus(status) {
    // Ignore status updates from outside, use hardcoded values
    console.log('Ignoring external status update:', JSON.stringify(status));
  }
}

module.exports = StatusPanel; 