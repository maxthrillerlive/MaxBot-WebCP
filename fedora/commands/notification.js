// This is a client-side command handler for the notification feature
module.exports = {
  name: 'notification',
  description: 'Send a desktop notification',
  execute: (client, args) => {
    const title = args[0] || 'MaxBot Notification';
    const body = args.slice(1).join(' ') || 'This is a test notification';
    
    client.sendDBusNotification(title, body);
    client.ui.logToConsole(`{green-fg}Sent notification: ${title}{/green-fg}`);
    
    return true;
  }
}; 