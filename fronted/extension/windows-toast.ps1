# One Windows toast for an unpackaged DevConnect notifier.
# Desktop (unpackaged) toasts require a Start Menu shortcut whose
# System.AppUserModel.ID matches the id passed to CreateToastNotifier.
# The shortcut is created once per target executable and kept in the user Start Menu.
$ErrorActionPreference = "Stop"
$AppId = "DevConnect.Notifier"
$title = $env:DC_NOTICE_TITLE
$body = $env:DC_NOTICE_BODY
$launch = $env:DC_NOTICE_LAUNCH
if ([string]::IsNullOrWhiteSpace($title)) { $title = "DevConnect" }
if ([string]::IsNullOrWhiteSpace($body)) {
  Write-Output "TOAST_REJECTED empty-body"
  exit 2
}
if ($null -eq $launch) { $launch = "" }

$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$shortcutPath = Join-Path $programs "DevConnect.lnk"
$target = $env:DC_NOTICE_TARGET
if ([string]::IsNullOrWhiteSpace($target)) { $target = Join-Path $env:SystemRoot "explorer.exe" }
$stampDir = Join-Path $env:LOCALAPPDATA "DevConnect"
$stampPath = Join-Path $stampDir "notifier-shortcut.txt"
$registered = (Test-Path -LiteralPath $shortcutPath) -and (Test-Path -LiteralPath $stampPath) -and ((Get-Content -LiteralPath $stampPath -Raw).Trim() -eq $target)

if (-not $registered) {
  New-Item -ItemType Directory -Force -Path $programs | Out-Null
  New-Item -ItemType Directory -Force -Path $stampDir | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $target
  $shortcut.WindowStyle = 7
  $shortcut.Description = "DevConnect notifications"
  $shortcut.Save()

  if (-not ("DevConnectAumid" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DevConnectAumid {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey {
    public Guid fmtid;
    public uint pid;
  }
  [StructLayout(LayoutKind.Explicit)]
  public struct PropVariant {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointer;
    public static PropVariant FromString(string value) {
      var variant = new PropVariant();
      variant.vt = 31;
      variant.pointer = Marshal.StringToCoTaskMemUni(value);
      return variant;
    }
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    uint GetCount(out uint cProps);
    uint GetAt(uint iProp, out PropertyKey pkey);
    uint GetValue(ref PropertyKey key, out PropVariant pv);
    uint SetValue(ref PropertyKey key, ref PropVariant pv);
    uint Commit();
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(string path, IntPtr pbc, uint flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
  public static void Set(string path, string appId) {
    var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2, ref iid, out store);
    var key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    var value = PropVariant.FromString(appId);
    store.SetValue(ref key, ref value);
    store.Commit();
    if (value.pointer != IntPtr.Zero) Marshal.FreeCoTaskMem(value.pointer);
  }
}
"@
  }
  [DevConnectAumid]::Set($shortcutPath, $AppId)
  Set-Content -LiteralPath $stampPath -Value $target -Encoding utf8
}

$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast activationType="protocol"><visual><binding template="ToastGeneric"><text></text><text></text></binding></visual></toast>')
$xml.DocumentElement.SetAttribute("launch", $launch)
$texts = $xml.GetElementsByTagName("text")
$texts.Item(0).InnerText = $title
$texts.Item(1).InnerText = $body
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Tag = "DevConnect"
$toast.Group = "DevConnect"
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)
$setting = [string]$notifier.Setting
if ($setting -ne "Enabled") {
  Write-Output "TOAST_REJECTED $setting"
  exit 2
}
$notifier.Show($toast)
[Console]::Out.Flush()
Write-Output "TOAST_SHOWN"
exit 0
