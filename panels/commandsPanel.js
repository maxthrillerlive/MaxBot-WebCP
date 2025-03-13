// Commands Panel Module
const blessed = require('blessed');

class CommandsPanel {
  constructor(grid, row, col, rowSpan, colSpan) {
    this.panel = grid.set(row, col, rowSpan, colSpan, blessed.list, {
      label: ' Commands ',
      tags: true,
      items: ['Loading commands...'],
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
  }

  updateCommands(commands) {
    try {
      if (!commands || commands.length === 0) {
        this.panel.setItems(['No commands available']);
        return;
      }
      
      const items = commands.map(cmd => {
        const enabledStatus = cmd.enabled ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
        return `${enabledStatus} ${cmd.trigger} - ${cmd.description}`;
      });
      
      this.panel.setItems(items);
    } catch (error) {
      console.error('Error updating commands panel:', error);
    }
  }
}

module.exports = CommandsPanel; 