// Status Panel Module
const blessed = require('blessed');

class StatusPanel {
  constructor(grid, row, col, rowSpan, colSpan) {
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.box, {
      label: ' Bot Status ',
      tags: true,
      content: '{center}Connecting to bot...{/center}',
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
  }

  updateStatus(status) {
    try {
      console.log('StatusPanel.updateStatus called with:', JSON.stringify(status));
      
      // Default values if not provided
      const connected = status.connected !== undefined ? status.connected : false;
      const channel = status.channel || 'Unknown';
      const uptime = status.uptime !== undefined ? status.uptime : 0;
      
      // Format the uptime
      let uptimeStr;
      if (uptime > 0) {
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        if (hours > 0) {
          uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
          uptimeStr = `${minutes}m ${seconds}s`;
        } else {
          uptimeStr = `${seconds}s`;
        }
      } else {
        uptimeStr = '0s';
      }
      
      // Format the display
      const connectedStatus = connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}';
      
      this.panel.setContent(
        `{bold}Connection:{/bold} ${connectedStatus}\n` +
        `{bold}Channel:{/bold} ${channel}\n` +
        `{bold}Uptime:{/bold} ${uptimeStr}`
      );
      
      console.log('Status panel updated');
    } catch (error) {
      console.error('Error updating status panel:', error);
    }
  }
}

module.exports = StatusPanel; 