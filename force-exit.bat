@echo off
echo Finding and killing MaxBot-tui processes...

REM Find all Node.js processes containing MaxBot-tui
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo csv ^| findstr /i "MaxBot-tui"') do (
    echo Killing process %%i with TASKKILL...
    taskkill /F /PID %%i
    echo Process %%i killed.
)

echo All MaxBot-tui processes should be terminated. 