; Swoop installer hooks (bundle.windows.nsis.installerHooks)

; Close a running Swoop quietly before its files are replaced, so an upgrade never stops to ask.
; The finish page offers to start it again.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "${MAINBINARYNAME}.exe"'
  Pop $0
  ${If} $0 = 0
    Sleep 500
  ${EndIf}
!macroend
