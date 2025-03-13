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
      
      const connectedStatus = status.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}';
      const channel = status.channel || 'None';
      const uptime = status.uptime ? `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` : '0s';
      
      this.panel.setContent(
        `{bold}Connection:{/bold} ${connectedStatus}\n` +
        `{bold}Channel:{/bold} ${channel}\n` +
        `{bold}Uptime:{/bold} ${uptime}`
      );
      
      console.log('Status panel updated');
    } catch (error) {
      console.error('Error updating status panel:', error);
    }
  }
}

module.exports = StatusPanel; 