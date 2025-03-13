// Admin Panel Module
const blessed = require('blessed');

class AdminPanel {
  constructor(grid, row, col, rowSpan, colSpan, client, ui) {
    this.client = client;
    this.ui = ui;
    
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.list, {
      label: ' Admin Panel ',
      tags: true,
      items: [
        '{blue-fg}Start Bot{/blue-fg}',
        '{green-fg}Restart Bot{/green-fg}',
        '{red-fg}Shutdown Bot{/red-fg}',
        '{yellow-fg}Clear Console{/yellow-fg}'
      ],
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        selected: {
          bg: 'cyan',
          fg: 'black'
        },
        item: {
          fg: 'white'
        },
        border: {
          fg: 'cyan'
        }
      },
      keys: true,
      vi: true,
      mouse: true
    });
    
    this.setupHandlers();
  }

  setupHandlers() {
    this.panel.on('select', async (item) => {
      const action = item.content;
      if (action.includes('Start Bot')) {
        const confirm = await this.ui.showConfirmDialog('Are you sure you want to start the bot?');
        if (confirm) {
          this.ui.logToConsole('{blue-fg}Starting bot...{/blue-fg}');
          this.client.startBot();
        }
      } else if (action.includes('Restart Bot')) {
        const confirm = await this.ui.showConfirmDialog('Are you sure you want to restart the bot?');
        if (confirm) {
          this.ui.logToConsole('{yellow-fg}Restarting bot...{/yellow-fg}');
          this.client.restartBot();
        }
      } else if (action.includes('Shutdown Bot')) {
        const confirm = await this.ui.showConfirmDialog('Are you sure you want to shutdown the bot?');
        if (confirm) {
          this.ui.logToConsole('{red-fg}Shutting down bot...{/red-fg}');
          this.client.exitBot();
        }
      } else if (action.includes('Clear Console')) {
        this.ui.consolePanel.clear();
        this.ui.logToConsole('{cyan-fg}Console cleared{/cyan-fg}');
      }
    });
  }
}

module.exports = AdminPanel; 