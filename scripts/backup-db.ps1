Add-Type -AssemblyName System.Windows.Forms

$projectRoot = Split-Path -Parent $PSScriptRoot
$dbPrimaryPath = Join-Path $projectRoot "prisma\prisma\dev.db"
$dbFallbackPath = Join-Path $projectRoot "prisma\dev.db"
$dbPath = if (Test-Path $dbPrimaryPath) { $dbPrimaryPath } elseif (Test-Path $dbFallbackPath) { $dbFallbackPath } else { $null }
$schemaPath = Join-Path $projectRoot "prisma\schema.prisma"
$migrationsPath = Join-Path $projectRoot "prisma\migrations"

if (-not $dbPath) {
  Write-Error "No se encontro la base de datos. Se buscaron: $dbPrimaryPath y $dbFallbackPath"
  exit 1
}

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Selecciona la carpeta destino para el backup"
$dialog.ShowNewFolderButton = $true

$result = $dialog.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($dialog.SelectedPath)) {
  Write-Host "Backup cancelado por el usuario."
  exit 0
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $dialog.SelectedPath "consorcios_backup_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupPrismaDir = Join-Path $backupDir "prisma"
New-Item -ItemType Directory -Path $backupPrismaDir -Force | Out-Null

Copy-Item -Path $dbPath -Destination (Join-Path $backupPrismaDir "dev.db") -Force

if (Test-Path $schemaPath) {
  Copy-Item -Path $schemaPath -Destination (Join-Path $backupPrismaDir "schema.prisma") -Force
}

if (Test-Path $migrationsPath) {
  Copy-Item -Path $migrationsPath -Destination (Join-Path $backupPrismaDir "migrations") -Recurse -Force
}

Write-Host "Backup generado en: $backupDir"
