param(
    [ValidateSet('Preview', 'Setup', 'Backend', 'Frontend')]
    [string]$Mode = 'Preview'
)

$ErrorActionPreference = 'Stop'
if ($Mode -eq 'Frontend') {
    $env:VITE_API_BASE_URL = 'http://127.0.0.1:8011'
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    npm.cmd run dev -- --host 127.0.0.1 --port 5181 --strictPort
    exit $LASTEXITCODE
}

$backend = Join-Path $PSScriptRoot 'backend'
$python = Join-Path $backend '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    $sharedPython = Join-Path $PSScriptRoot '../../backend/.venv/Scripts/python.exe'
    if (Test-Path -LiteralPath $sharedPython) {
        $python = (Resolve-Path -LiteralPath $sharedPython).Path
    } else {
        py -3.11 -m venv (Join-Path $backend '.venv')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $python -m pip install -r (Join-Path $backend 'requirements.txt')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

Set-Location -LiteralPath $backend
$env:DATABASE_URL = 'sqlite:///investor-demo.sqlite3'
$env:DEBUG = 'True'
$env:EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
$env:FORCE_SEED = 'false'

if ($Mode -eq 'Setup' -or $Mode -eq 'Preview') {
    & $python manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $python manage.py seed_if_empty
    if ($LASTEXITCODE -ne 0 -or $Mode -eq 'Setup') { exit $LASTEXITCODE }
}

if ($Mode -eq 'Preview') {
    $env:VITE_API_BASE_URL = '/'
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    npm.cmd run build -- --outDir .vite-local-build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Set-Location -LiteralPath $backend
    Write-Host 'Open http://127.0.0.1:5182/ in your browser. Keep this window open.'
    & $python -u manage.py runserver 127.0.0.1:5182 --noreload --settings=themba_project.investor_settings
} else {
    & $python -u manage.py runserver 127.0.0.1:8011 --noreload
}
exit $LASTEXITCODE
