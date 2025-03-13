@echo off
echo Starting MaxBot-tui with a 15-second timeout...

REM Start the application
start /B node src/index.js

REM Wait for 15 seconds
echo Application started. Will force exit after 15 seconds.
timeout /t 15

REM Kill all Node.js processes containing MaxBot-tui
echo Forcing exit...
taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq *MaxBot-tui*"
echo Application terminated. 