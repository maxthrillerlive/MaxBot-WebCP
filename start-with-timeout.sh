#!/bin/bash

# Start MaxBot-tui with a timeout
echo "Starting MaxBot-tui with a 15-second timeout..."

# Start the application in the background
node src/index.js &
APP_PID=$!

# Wait for 15 seconds
echo "Application started with PID $APP_PID. Will force exit after 15 seconds."
sleep 15

# Check if the process is still running
if ps -p $APP_PID > /dev/null; then
    echo "Application is still running after 15 seconds. Forcing exit..."
    kill -9 $APP_PID
    echo "Application terminated."
else
    echo "Application has already exited."
fi 