; 栖屿数字人平台 Inno Setup 打包脚本
; 构建：ISCC.exe /DMyAppVersion=2.0.0 qiyu.iss
; 源目录：electron-builder --dir 产出的 win-unpacked（含生产 VITE_API_URL）

#define MyAppName "栖屿数字人平台"
#ifndef MyAppVersion
  #define MyAppVersion "2.0.0"
#endif
#define MyAppExeName "栖屿数字人平台.exe"
#define MyAppPublisher "qiyu"

[Setup]
; 固定 AppId：升级/卸载识别的唯一标识，勿更改
AppId={{7A1E9C4B-3D2F-4A8B-8C5D-1E2F3A4B5C6D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\release3
OutputBaseFilename=栖屿数字人平台-Setup-{#MyAppVersion}
SetupIconFile=..\..\public\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
CloseApplications=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "D:\Program_files\Inno Setup 6\Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\release3\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载不删除用户数据（%APPDATA%\栖屿数字人平台 由 Electron 管理，此处仅清安装目录，无需条目）
