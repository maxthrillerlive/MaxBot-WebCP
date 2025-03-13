#!/bin/bash

# Find and kill all MaxBot-tui processes
echo "Finding and killing MaxBot-tui processes..."

# Find all Node.js processes containing MaxBot-tui
pids=$(ps aux | grep "node.*MaxBot-tui" | grep -v "grep" | awk '{print $2}')

if [ -z "$pids" ]; then
    echo "No MaxBot-tui processes found."
else
    echo "Found MaxBot-tui processes: $pids"
    
    # Kill each process with SIGKILL
    for pid in $pids; do
        echo "Killing process $pid with SIGKILL..."
        kill -9 $pid
        echo "Process $pid killed."
    done
    
    echo "All MaxBot-tui processes should be terminated."
fi 