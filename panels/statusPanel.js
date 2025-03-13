// Update the StatusPanel class with a more direct approach to uptime
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
    
    // Initialize uptime counter
    this.hours = 0;
    this.minutes = 0;
    this.seconds = 0;
    
    // Set initial status
    this.updateStatus();
    
    // Update uptime every second
    this.timer = setInterval(() => {
      // Increment seconds
      this.seconds++;
      
      // Handle minute rollover
      if (this.seconds >= 60) {
        this.seconds = 0;
        this.minutes++;
      }
      
      // Handle hour rollover
      if (this.minutes >= 60) {
        this.minutes = 0;
        this.hours++;
      }
      
      // Update the display
      this.updateStatus();
    }, 1000);
  }
  
  updateStatus() {
    try {
      // Format uptime
      const uptimeStr = `${this.hours}h ${this.minutes}m ${this.seconds}s`;
      
      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const rss = Math.round(memoryUsage.rss / 1024 / 1024);
      const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      
      // Set content
      this.panel.setContent(
        `{bold}Connection:{/bold} {green-fg}Connected{/green-fg}\n` +
        `{bold}Username:{/bold} Max2d2\n` +
        `{bold}Channel:{/bold} #maxthriller\n` +
        `{bold}Uptime:{/bold} ${uptimeStr}\n` +
        `{bold}Process ID:{/bold} ${process.pid}\n` +
        `{bold}Memory:{/bold} RSS: ${rss}MB, Heap: ${heapUsed}/${heapTotal}MB\n` +
        `{bold}Last Updated:{/bold} ${new Date().toLocaleTimeString()}`
      );
      
      // Force render
      if (this.panel.screen) {
        this.panel.screen.render();
      }
    } catch (error) {
      console.error('Error updating status panel:', error);
    }
  }
  
  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = StatusPanel; 