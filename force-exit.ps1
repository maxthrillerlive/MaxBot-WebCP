Write-Host "Searching for MaxBot-tui processes..."

$processes = Get-Process | Where-Object { $_.CommandLine -like "*MaxBot-tui*" -and $_.CommandLine -notlike "*force-exit*" }

if ($processes.Count -eq 0) {
    Write-Host "No MaxBot-tui processes found."
    exit
}

Write-Host "Found $($processes.Count) MaxBot-tui processes. Killing them..."

foreach ($process in $processes) {
    Write-Host "Killing process $($process.Id)"
    try {
        Stop-Process -Id $process.Id -Force
        Write-Host "Process $($process.Id) killed."
    } catch {
        Write-Host "Error killing process $($process.Id): $_"
    }
}

Write-Host "All MaxBot-tui processes should be terminated." 