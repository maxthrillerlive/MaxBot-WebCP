#!/usr/bin/env node

const dbus = require('dbus-next');

async function monitorDBus() {
  try {
    console.log('Starting D-Bus monitor for MaxBot messages...');
    console.log('Press Ctrl+C to exit');
    
    // Connect to the session bus
    const bus = dbus.sessionBus();
    
    // Try to get the MaxBot service object
    try {
      const obj = await bus.getProxyObject('org.maxbot.Service', '/org/maxbot/Service');
      const iface = obj.getInterface('org.maxbot.Interface');
      
      console.log('Connected to MaxBot D-Bus service');
      console.log('Listening for signals...');
      
      // Listen for signals
      iface.on('MessageReceived', (sender, message) => {
        console.log(`[${new Date().toISOString()}] Message from ${sender}: ${message}`);
      });
    } catch (error) {
      console.log('MaxBot D-Bus service not found, monitoring system notifications only');
    }
    
    // Monitor system notifications
    try {
      const notificationObj = await bus.getProxyObject(
        'org.freedesktop.Notifications', 
        '/org/freedesktop/Notifications'
      );
      
      const notificationIface = notificationObj.getInterface('org.freedesktop.Notifications');
      
      console.log('Connected to system notification service');
      
      notificationIface.on('NotificationClosed', (id, reason) => {
        console.log(`[${new Date().toISOString()}] Notification ${id} closed, reason: ${reason}`);
      });
      
      notificationIface.on('ActionInvoked', (id, actionKey) => {
        console.log(`[${new Date().toISOString()}] Notification ${id} action invoked: ${actionKey}`);
      });
    } catch (error) {
      console.error('Failed to connect to system notification service:', error);
    }
    
    // Keep the process running
    process.stdin.resume();
    
    // Handle exit
    process.on('SIGINT', () => {
      console.log('\nExiting D-Bus monitor');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error in D-Bus monitor:', error);
    process.exit(1);
  }
}

monitorDBus(); 