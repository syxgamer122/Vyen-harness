@echo off
REM Mo Vyen desktop app. Cua so terminal nay tu dong sau khi app len,
REM nen bam file nay thay vi mo terminal go lenh.
REM
REM --prod uses the production build (cold start ~3.5s). Drop that flag while
REM coding if you want Fast Refresh: edit code and it reloads, but the first
REM open has to wait for next dev to compile (can be 40-80s cold).
REM
REM If --prod says "chua co production build", run `npm run build` once.

cd /d "%~dp0"

if not exist node_modules (
  echo Chua cai dependencies. Dang chay npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Thu lai sau.
    pause
    exit /b 1
  )
)

REM No .next\BUILD_ID yet means --prod would just error out. Use dev on the
REM very first run so it is not blocked; later runs pick --prod automatically.
if exist ".next\BUILD_ID" (
  start "" node scripts\launch-desktop.cjs --prod
) else (
  echo Chua co production build - chay next dev lan dau.
  node scripts\launch-desktop.cjs
)

REM Close this terminal; the app keeps running in its own window.
exit /b 0
