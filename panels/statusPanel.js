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
      
      // Format the status information
      const connectedStatus = status.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}';
      const channel = status.channel || 'Unknown';
      const uptime = status.uptime ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m ${status.uptime % 60}s` : '0s';
      
      // Build the content
      let content = `{bold}Connection:{/bold} ${connectedStatus}\n` +
                    `{bold}Channel:{/bold} ${channel}\n` +
                    `{bold}Uptime:{/bold} ${uptime}`;
      
      // Add username if available
      if (status.username) {
        content += `\n{bold}Username:{/bold} ${status.username}`;
      }
      
      // Add process ID if available
      if (status.processId) {
        content += `\n{bold}Process ID:{/bold} ${status.processId}`;
      }
      
      // Update the panel content
      this.panel.setContent(content);
      
      console.log('Status panel content updated');
    } catch (error) {
      console.error('Error updating status panel:', error);
    }
  }
}

module.exports = StatusPanel; 