const blessed = require('blessed');

class StatusPanel {
  constructor(grid, row, col, rowSpan, colSpan) {
    console.log('Creating StatusPanel');
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.box, {
      label: ' Bot Status (Disabled) ',
      tags: true,
      content: '{center}Status panel is disabled{/center}',
      border: {
        type: 'line',
        fg: 'gray'
      },
      style: {
        fg: 'gray',
        border: {
          fg: 'gray'
        }
      }
    });
    
    // Initialize uptime counter
    this.hours = 0;
    this.minutes = 0;
    this.seconds = 0;
    
    // Set initial status
    this.updateStatus();
    
    // Update status immediately
    this.updateStatus();
    
    // Set up timer to update every second
    this.timer = setInterval(() => {
      console.log('Timer tick - updating status');
      this.updateStatus();
    }, 1000);

    // Add this before creating the admin button
    this.messageBox = this.grid.set(8, 0, 1, 12, blessed.box, {
      content: '{center}Press X, Q, Escape, or Ctrl+C to exit, or click the button below{/center}',
      tags: true,
      style: {
        fg: 'yellow'
      }
    });

    // Replace it with this button implementation:
    this.adminBox = this.grid.set(9, 0, 3, 12, blessed.button, {
      label: ' Admin Panel ',
      content: 'Exit Application',
      tags: true,
      border: {
        type: 'line',
        fg: 'red'
      },
      style: {
        fg: 'white',
        bg: 'red',
        focus: {
          bg: 'dark-red'
        },
        hover: {
          bg: 'dark-red'
        },
        border: {
          fg: 'red'
        }
      },
      mouse: true,
      keys: true,
      vi: true
    });

    // Add this right after creating the button
    this.adminBox.on('press', () => {
      console.log('Exit button pressed');
      process.exit(0);
    });

    // Add these key bindings after creating the screen
    this.screen.key(['x', 'X', 'q', 'Q', 'escape', 'C-c'], () => {
      console.log('Exit key pressed');
      process.exit(0);
    });

    // Add this after creating all UI elements
    this.adminBox.focus();

    // Add this at the end of your setupScreen method
    this.screen.render();
  }
  
  updateStatus() {
    try {
      // Use process.uptime() for accurate uptime tracking
      const uptimeSeconds = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSeconds / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const seconds = uptimeSeconds % 60;
      const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
      
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