#define MyAppName "PC Remote Agent"
#define MyAppVersion "0.0.2"
#define MyAppPublisher "PC Remote"
#define MyAppExeName "agent.exe"
#define MyServiceName "PCRemoteAgent"
#define MyAppId "B3C4D5E6-F7A8-9012-BCDE-F12345678901"

[Setup]
AppId={{{#MyAppId}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=output
OutputBaseFilename=pc-remote-agent-setup
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
; При повторной установке не спрашивать — сразу заменить
CloseApplications=yes
CloseApplicationsFilter=*agent.exe*

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "winsw\winsw.exe"; DestDir: "{app}"; DestName: "agent-svc.exe"; \
  Flags: ignoreversion; AfterInstall: CreateWinSWConfig
Source: "..\apps\agent\dist-win\agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "tray.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "tray-launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "set-password.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Launch PC Remote Tray"; \
  Filename: "{app}\tray-launcher.vbs"; \
  IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

[Registry]
; Auto-start tray on user login
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "PC Remote Tray"; \
  ValueData: "wscript.exe ""{app}\tray-launcher.vbs"""; \
  Flags: uninsdeletevalue

[Dirs]
Name: "{commonappdata}\pc-remote-agent"; Permissions: system-full admins-full

[Run]
; Create and restrict permissions on ProgramData\pc-remote-agent (SYSTEM and Administrators only)
Filename: "icacls.exe"; \
  Parameters: """{commonappdata}\pc-remote-agent"" /inheritance:r /grant:r ""*S-1-5-18:(OI)(CI)F"" ""*S-1-5-32-544:(OI)(CI)F"""; \
  Flags: runhidden waituntilterminated

; Register and start service
Filename: "{app}\agent-svc.exe"; Parameters: "install"; \
  Flags: runhidden waituntilterminated
Filename: "{app}\agent-svc.exe"; Parameters: "start"; \
  Flags: runhidden waituntilterminated

; Set password via HTTP after service startup
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\set-password.ps1"" -Password ""{code:GetTrayPassword}"""; \
  Flags: runhidden waituntilterminated

; Service permissions: SYSTEM and Administrators full control, authenticated users read status
Filename: "sc.exe"; \
  Parameters: "sdset {#MyServiceName} D:(A;;CCLCSWRPWPDTLOCRRCSDWDWO;;;SY)(A;;CCLCSWRPWPDTLOCRRCSDWDWO;;;BA)(A;;CCLCLOCRRC;;;AU)"; \
  Flags: runhidden waituntilterminated

; Launch tray after installation
Filename: "wscript.exe"; \
  Parameters: """{app}\tray-launcher.vbs"""; \
  Description: "Launch PC Remote System Tray"; \
  Flags: runhidden nowait postinstall

[UninstallRun]
; 0. Remove Windows Defender exclusion
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -Command ""Remove-MpPreference -ExclusionPath '{app}' -ErrorAction SilentlyContinue"""; \
  Flags: runhidden waituntilterminated

; 1. Stop tray PowerShell process
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -Command ""Get-CimInstance Win32_Process | Where-Object {{$_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*tray.ps1*'} | ForEach-Object {{Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}"""; \
  Flags: runhidden waituntilterminated

; 2. Stop agent.exe if running outside service
Filename: "taskkill.exe"; Parameters: "/F /IM {#MyAppExeName}"; \
  Flags: runhidden waituntilterminated

; 3. Reset DACL before uninstall
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -Command ""Remove-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#MyServiceName}' -Name Security -Force -ErrorAction SilentlyContinue"""; \
  Flags: runhidden waituntilterminated

; 4. Stop and uninstall service
Filename: "{app}\agent-svc.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated
Filename: "{app}\agent-svc.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated

[UninstallDelete]
; Delete config, tokens, and logs from ProgramData
Type: filesandordirs; Name: "{commonappdata}\pc-remote-agent"

[Code]
var
  ServerUrlPage: TInputQueryWizardPage;
  PasswordPage: TInputQueryWizardPage;

{ ------------------------------------------------------------------ }
{ Check if service exists                                            }
{ ------------------------------------------------------------------ }
function ServiceExists: Boolean;
var
  ResultCode: Integer;
begin
  Exec('sc.exe', 'query {#MyServiceName}', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  Result := (ResultCode = 0);
end;

{ ------------------------------------------------------------------ }
{ Stop processes and service prior to copying files                 }
{ ------------------------------------------------------------------ }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  I: Integer;
begin
  Result := '';

  Exec('powershell.exe',
    '-NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process | Where-Object {$_.Name -eq ''powershell.exe'' -and $_.CommandLine -like ''*tray.ps1*''} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Exec('taskkill.exe', '/F /IM {#MyAppExeName}',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Exec('powershell.exe',
    '-NoProfile -WindowStyle Hidden -Command "Add-MpPreference' +
    ' -ExclusionPath ''' + ExpandConstant('{app}') + '''' +
    ' -ErrorAction SilentlyContinue"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  if ServiceExists then begin
    Exec('sc.exe', 'stop {#MyServiceName}',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);

    Exec('powershell.exe',
      '-NoProfile -WindowStyle Hidden -Command "Remove-ItemProperty' +
      ' -Path ''HKLM:\SYSTEM\CurrentControlSet\Services\{#MyServiceName}''' +
      ' -Name Security -Force -ErrorAction SilentlyContinue"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    if FileExists(ExpandConstant('{app}\agent-svc.exe')) then
      Exec(ExpandConstant('{app}\agent-svc.exe'), 'uninstall',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('sc.exe', 'delete {#MyServiceName}',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('powershell.exe',
      '-NoProfile -WindowStyle Hidden -Command' +
      ' "Get-WmiObject Win32_Service | Where-Object Name -eq ''{#MyServiceName}'' | ForEach-Object { $_.Delete() }"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    Exec('powershell.exe',
      '-NoProfile -WindowStyle Hidden -Command "Remove-Item' +
      ' ''HKLM:\SYSTEM\CurrentControlSet\Services\{#MyServiceName}''' +
      ' -Recurse -Force -ErrorAction SilentlyContinue"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    for I := 0 to 10 do begin
      Sleep(500);
      Exec('sc.exe', 'query {#MyServiceName}',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      if ResultCode <> 0 then break;
    end;

    Exec('sc.exe', 'query {#MyServiceName}',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ResultCode = 0 then begin
      Exec('schtasks.exe',
        '/Create /TN "PCRCleanup" /TR ' +
        '"sc.exe sdset {#MyServiceName} D:(A;;CCLCSWRPWPDTLOCRRCSDWDWO;;;SY)(A;;CCLCSWRPWPDTLOCRRCSDWDWO;;;BA) && ' +
        'sc.exe stop {#MyServiceName} && sc.exe delete {#MyServiceName}" ' +
        '/SC ONCE /ST 00:00 /RU SYSTEM /F',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec('schtasks.exe', '/Run /TN "PCRCleanup"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(4000);
      Exec('schtasks.exe', '/Delete /TN "PCRCleanup" /F',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      for I := 0 to 20 do begin
        Sleep(500);
        Exec('sc.exe', 'query {#MyServiceName}',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        if ResultCode <> 0 then break;
      end;
    end;
  end;
end;

{ ------------------------------------------------------------------ }
{ Check existing installation                                        }
{ ------------------------------------------------------------------ }
function InitializeSetup: Boolean;
var
  UninstallKey: String;
begin
  Result := True;
  UninstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{' +
    '{#MyAppId}' + '}_is1';
  if RegKeyExists(HKLM, UninstallKey) then begin
    if MsgBox(
      'PC Remote Agent is already installed on this computer.' + #13#10 + #13#10 +
      'Continue? The old version will be stopped and replaced.' + #13#10 +
      'Existing configuration and device pairing will be preserved.',
      mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;

{ ------------------------------------------------------------------ }
{ Create WinSW Config                                                }
{ ------------------------------------------------------------------ }
procedure CreateWinSWConfig;
var
  ConfigPath: String;
  Lines: TArrayOfString;
  ServerUrl: String;
begin
  ServerUrl := ServerUrlPage.Values[0];
  ConfigPath := ExpandConstant('{app}\agent-svc.xml');

  SetArrayLength(Lines, 19);
  Lines[0]  := '<?xml version="1.0" encoding="UTF-8"?>';
  Lines[1]  := '<service>';
  Lines[2]  := '  <id>{#MyServiceName}</id>';
  Lines[3]  := '  <name>{#MyAppName}</name>';
  Lines[4]  := '  <description>PC Remote Agent - remote PC control</description>';
  Lines[5]  := '  <executable>' + ExpandConstant('{app}\{#MyAppExeName}') + '</executable>';
  Lines[6]  := '  <env name="SERVER_URL" value="' + ServerUrl + '"/>';
  Lines[7]  := '  <env name="NODE_ENV" value="production"/>';
  Lines[8]  := '  <env name="LOG_LEVEL" value="info"/>';
  Lines[9]  := '  <startmode>Automatic</startmode>';
  Lines[10] := '  <serviceaccount>';
  Lines[11] := '    <username>LocalSystem</username>';
  Lines[12] := '  </serviceaccount>';
  Lines[13] := '  <stoptimeout>15 sec</stoptimeout>';
  Lines[14] := '  <log mode="none"/>';
  Lines[15] := '  <onfailure action="restart" delay="10 sec"/>';
  Lines[16] := '  <onfailure action="restart" delay="30 sec"/>';
  Lines[17] := '  <resetperiod>1 day</resetperiod>';
  Lines[18] := '</service>';

  SaveStringsToFile(ConfigPath, Lines, False);
end;

function GetTrayPassword(Param: String): String;
begin
  Result := PasswordPage.Values[0];
end;

{ ------------------------------------------------------------------ }
{ Setup Wizard Pages                                                 }
{ ------------------------------------------------------------------ }
procedure InitializeWizard;
begin
  ServerUrlPage := CreateInputQueryPage(wpSelectDir,
    'Connection Setup', 'Specify PC Remote server address',
    'Server URL (Render, ngrok, or custom domain).');
  ServerUrlPage.Add('Server URL:', False);
  ServerUrlPage.Values[0] := 'https://pc-remote-backend.onrender.com';

  PasswordPage := CreateInputQueryPage(ServerUrlPage.ID,
    'Tray Security', 'Set a password to protect tray menu actions',
    'This password will be required for tray actions (show QR, reset binding, etc).');
  PasswordPage.Add('Password:', True);
  PasswordPage.Add('Confirm Password:', True);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = ServerUrlPage.ID then begin
    if Trim(ServerUrlPage.Values[0]) = '' then begin
      MsgBox('Please enter a Server URL.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = PasswordPage.ID then begin
    if Trim(PasswordPage.Values[0]) = '' then begin
      MsgBox('Password cannot be empty.', mbError, MB_OK);
      Result := False;
    end else if PasswordPage.Values[0] <> PasswordPage.Values[1] then begin
      MsgBox('Passwords do not match.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

