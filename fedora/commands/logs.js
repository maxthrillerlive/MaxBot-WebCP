// This is a client-side command handler for viewing D-Bus logs
module.exports = {
  name: 'logs',
  description: 'View recent logs from D-Bus',
  execute: (client, args) => {
    // Create a popup to display logs
    const blessed = client.ui.blessed;
    const screen = client.ui.screen;
    
    const logBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      label: ' Recent Logs ',
      tags: true,
      scrollable: true,
      mouse: true,
      keys: true,
      vi: true,
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
        fg: 'blue'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'blue'
        }
      }
    });
    
    // Add a close button
    const closeButton = blessed.button({
      parent: logBox,
      bottom: 0,
      left: 'center',
      width: 10,
      height: 1,
      content: 'Close',
      tags: true,
      border: {
        type: 'line',
        fg: 'blue'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          bg: 'cyan'
        },
        hover: {
          bg: 'cyan'
        }
      }
    });
    
    closeButton.on('press', () => {
      logBox.destroy();
      screen.render();
    });
    
    // Request logs from server
    client.ws.send(JSON.stringify({
      type: 'get-logs',
      data: {}
    }));
    
    // Display a loading message
    logBox.setContent('{center}Loading logs...{/center}');
    
    // Handle log response
    const messageHandler = (data) => {
      try {
        const message = JSON.parse(data);
        
        if (message.type === 'logs-response') {
          const logs = message.data.logs;
          
          if (logs.length === 0) {
            logBox.setContent('{center}No logs available{/center}');
          } else {
            // Format and display logs
            const formattedLogs = logs.map(log => {
              const { level, message, timestamp } = log;
              
              let prefix;
              switch (level) {
                case 'error':
                  prefix = '{red-fg}[ERROR]{/red-fg}';
                  break;
                case 'warn':
                  prefix = '{yellow-fg}[WARN]{/yellow-fg}';
                  break;
                case 'debug':
                  prefix = '{gray-fg}[DEBUG]{/gray-fg}';
                  break;
                case 'info':
                default:
                  prefix = '{white-fg}[INFO]{/white-fg}';
                  break;
              }
              
              // Format timestamp
              const date = new Date(timestamp);
              const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
              
              return `${timeStr} ${prefix} ${message}`;
            }).join('\n');
            
            logBox.setContent(formattedLogs);
            logBox.scrollTo(logBox.getScrollHeight());
          }
          
          // Remove the temporary handler
          client.ws.removeListener('message', messageHandler);
        }
      } catch (error) {
        console.error('Error processing log response:', error);
      }
      
      screen.render();
    };
    
    // Add temporary message handler
    client.ws.on('message', messageHandler);
    
    screen.render();
    return true;
  }
}; 