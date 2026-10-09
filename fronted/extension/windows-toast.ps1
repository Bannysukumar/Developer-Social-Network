# Shows one Windows toast for an unpackaged DevConnect notifier.
# Requires a Start Menu shortcut whose AppUserModelID matches the notifier id.
$ErrorActionPreference = "Stop"
$AppId = "DevConnect.Notifier"
$title = $env:DC_NOTICE_TITLE
$body = $env:DC_NOTICE_BODY
$launch = $env:DC_NOTICE_LAUNCH
if ([string]::IsNullOrWhiteSpace($title)) { $title = "DevConnect" }
if ([string]::IsNullOrWhiteSpace($body)) { throw "DC_NOTICE_BODY is empty" }

function Escape-Xml([string]$value) {
  if ($null -eq $value) { return "" }
  return ($value -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
}

$shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\DevConnect.lnk"
$target = $env:DC_NOTICE_TARGET
if ([string]::IsNullOrWhiteSpace($target)) { $target = "$env:SystemRoot\explorer.exe" }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WindowStyle = 7
$shortcut.Description = "DevConnect notifications"
$shortcut.Save()

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
[DevConnectAumid]::Set($shortcutPath, $AppId)

$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$safeTitle = Escape-Xml $title
$safeBody = Escape-Xml $body
$safeLaunch = Escape-Xml $launch
$xmlText = @"
<toast activationType="protocol" launch="$safeLaunch">
  <visual>
    <binding template="ToastGeneric">
      <text>$safeTitle</text>
      <text>$safeBody</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Tag = "DevConnect"
$toast.Group = "DevConnect"
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)
$notifier.Show($toast)
Write-Output "TOAST_SHOWN"
