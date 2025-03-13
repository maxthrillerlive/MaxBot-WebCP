#!/bin/bash

# Start the application
echo "Starting MaxBot TUI..."
node src/index.js &
APP_PID=$!

# Print the PID
echo "Application started with PID: $APP_PID"

# Wait for 10 seconds
echo "Will forcefully kill the application after 10 seconds..."
sleep 10

# Kill the application
echo "Killing application..."
kill -9 $APP_PID

# Also kill all Node.js processes just to be sure
echo "Killing all Node.js processes..."
pkill -9 node

echo "Application should be terminated." 