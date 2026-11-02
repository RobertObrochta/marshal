@echo off
setlocal

REM ---- Settings ----
set "HOST=10.0.0.165"
set "SSH_USER=debian"
set "APP_DIR=/home/debian/marshal/web"
set "DATA_DIR=/home/debian/marshal/data"
set "SEED_DIR=/tmp/marshal-data-seed"

cd /d "%~dp0"

echo [1/4] Building...
call npm run build
if errorlevel 1 goto fail

echo [2/4] Preparing %HOST%...
ssh %SSH_USER%@%HOST% "mkdir -p %APP_DIR% %DATA_DIR% && rm -rf %APP_DIR%/dist %SEED_DIR%"
if errorlevel 1 goto fail

echo [3/4] Copying app...
scp -r dist server.js package.json package-lock.json %SSH_USER%@%HOST%:%APP_DIR%/
if errorlevel 1 goto fail

REM "deploy.bat data" only adds data files that don't exist on the BeagleBone yet.
REM Existing files are never overwritten.
if /i "%~1"=="data" (
  echo Seeding missing data files, existing ones are left alone...
  scp -r data %SSH_USER%@%HOST%:%SEED_DIR%
  if errorlevel 1 goto fail
  ssh %SSH_USER%@%HOST% "for f in %SEED_DIR%/*; do [ -e %DATA_DIR%/${f##*/} ] || cp $f %DATA_DIR%/; done; rm -rf %SEED_DIR%"
  if errorlevel 1 goto fail
)

echo [4/4] Installing production dependencies...
ssh %SSH_USER%@%HOST% "cd %APP_DIR% && npm install --omit=dev"
if errorlevel 1 goto fail

echo.
echo Deployed to %SSH_USER%@%HOST%:%APP_DIR%
exit /b 0

:fail
echo.
echo Deploy failed.
exit /b 1
