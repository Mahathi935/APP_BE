<#
  test_backend.ps1
  Full test script for your backend (signup, login, slots, appointments, lab tests, calendar events)
  Usage: edit variables below, then run in PowerShell:
    PS> .\test_backend.ps1
#>

# ---------- Configuration (EDIT THESE) ----------
$baseUrl = "http://localhost:3000"

# Doctor credentials (will be used in signup if not already present)
$doctorPhone = "9000000002"
$doctorPassword = "doctorpass123"
$doctorName = "Dr Bob AutoTest"
$doctorLicense = "LIC-12345"
$doctorSpecialization = "General"

# Patient credentials (will be used in signup if not already present)
$patientPhone = "9000000001"
$patientPassword = "patientpass123"
$patientName = "Test Patient Auto"

# Toggle: if true, attempt signup for both roles even if likely present
$forceSignup = $false

# ---------- Helper functions ----------
function Pretty($obj) {
  $obj | ConvertTo-Json -Depth 6
}

function ApiPost($path, $body, $token = $null) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  try {
    return Invoke-RestMethod -Method Post -Uri ("$baseUrl$path") -Body ($body | ConvertTo-Json -Depth 6) -Headers $headers -ContentType "application/json"
  } catch {
    Write-Host "POST $path failed:`n$($_.Exception.Response.StatusCode) - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      $r = $_.Exception.Response.GetResponseStream()
      $sr = New-Object System.IO.StreamReader($r)
      Write-Host ($sr.ReadToEnd()) -ForegroundColor Yellow
    }
    throw $_
  }
}

function ApiGet($path, $token = $null) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  try {
    return Invoke-RestMethod -Method Get -Uri ("$baseUrl$path") -Headers $headers
  } catch {
    Write-Host "GET $path failed:`n$($_.Exception.Response.StatusCode) - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      $r = $_.Exception.Response.GetResponseStream()
      $sr = New-Object System.IO.StreamReader($r)
      Write-Host ($sr.ReadToEnd()) -ForegroundColor Yellow
    }
    throw $_
  }
}

function ApiDelete($path, $token = $null) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  try {
    return Invoke-RestMethod -Method Delete -Uri ("$baseUrl$path") -Headers $headers
  } catch {
    Write-Host "DELETE $path failed:`n$($_.Exception.Response.StatusCode) - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      $r = $_.Exception.Response.GetResponseStream()
      $sr = New-Object System.IO.StreamReader($r)
      Write-Host ($sr.ReadToEnd()) -ForegroundColor Yellow
    }
    throw $_
  }
}

function ApiPut($path, $body, $token = $null) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  try {
    return Invoke-RestMethod -Method Put -Uri ("$baseUrl$path") -Body ($body | ConvertTo-Json -Depth 6) -Headers $headers -ContentType "application/json"
  } catch {
    Write-Host "PUT $path failed:`n$($_.Exception.Response.StatusCode) - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      $r = $_.Exception.Response.GetResponseStream()
      $sr = New-Object System.IO.StreamReader($r)
      Write-Host ($sr.ReadToEnd()) -ForegroundColor Yellow
    }
    throw $_
  }
}

# ---------- Script start ----------
Write-Host "Starting backend test flow against $baseUrl" -ForegroundColor Cyan

# 1) Signup doctor (if force or not present)
if ($forceSignup) {
  Write-Host "`n1) Signing up doctor..."
  try {
    $signupDocPayload = @{
      phone_number = $doctorPhone
      password = $doctorPassword
      role = "doctor"
      name = $doctorName
      sex = "M"
      date_of_birth = "1980-01-01"
      license_number = $doctorLicense
      specialization = $doctorSpecialization
    }
    $res = ApiPost "/signup" $signupDocPayload
    Write-Host "Doctor signup response:"; Pretty $res
  } catch {
    Write-Host "Doctor signup error (maybe already exists) - continuing." -ForegroundColor Yellow
  }
}

# 2) Signup patient (if force or not present)
if ($forceSignup) {
  Write-Host "`n2) Signing up patient..."
  try {
    $signupPatPayload = @{
      phone_number = $patientPhone
      password = $patientPassword
      role = "patient"
      name = $patientName
      sex = "F"
      date_of_birth = "1995-01-01"
    }
    $res = ApiPost "/signup" $signupPatPayload
    Write-Host "Patient signup response:"; Pretty $res
  } catch {
    Write-Host "Patient signup error (maybe already exists) - continuing." -ForegroundColor Yellow
  }
}

# 3) Login doctor
Write-Host "`n3) Logging in doctor..."
$loginDocPayload = @{ phone_number = $doctorPhone; password = $doctorPassword }
try {
  $loginDocRes = ApiPost "/login" $loginDocPayload
  $doctorToken = $loginDocRes.token
  Write-Host "Doctor token acquired:" $doctorToken.Substring(0,40) "...(truncated)"
} catch {
  Write-Host "Doctor login failed. Make sure doctor credentials are correct or set `\$forceSignup = $true` to create a new account." -ForegroundColor Red
  exit 1
}

# 4) Login patient
Write-Host "`n4) Logging in patient..."
$loginPatPayload = @{ phone_number = $patientPhone; password = $patientPassword }
try {
  $loginPatRes = ApiPost "/login" $loginPatPayload
  $patientToken = $loginPatRes.token
  Write-Host "Patient token acquired:" $patientToken.Substring(0,40) "...(truncated)"
} catch {
  Write-Host "Patient login failed. Make sure patient credentials are correct or set `\$forceSignup = $true` to create a new account." -ForegroundColor Red
  exit 1
}

# 5) Fetch profiles
Write-Host "`n5) Fetching profiles..."
$docProfile = ApiGet "/doctors/me" $doctorToken
Write-Host "Doctor profile:"; Pretty $docProfile
$patProfile = ApiGet "/patients/me" $patientToken
Write-Host "Patient profile:"; Pretty $patProfile

# 6) Doctor creates slots
Write-Host "`n6) Doctor creating slots..."
# create 2 test slots — you can change times
$slotTimes = @(
  (Get-Date).AddDays(2).ToString("yyyy-MM-dd 10:00:00"),
  (Get-Date).AddDays(2).ToString("yyyy-MM-dd 11:00:00")
)
$createSlotsPayload = @{ slots = $slotTimes }
$createSlotsRes = ApiPost "/doctor/slots" $createSlotsPayload $doctorToken
Write-Host "Slots insert result:"; Pretty $createSlotsRes

# 7) Patient lists Dr Bob's slots
Write-Host "`n7) Patient fetching doctor's public slots..."
$doctorLookup = $doctorPhone # endpoint looks by phone_number
$slots = ApiGet ("/doctors/$doctorLookup/slots") $patientToken
Write-Host "Doctor slots (raw):"; Pretty $slots

# pick first available slot_id
if ($slots -is [System.Collections.IEnumerable]) {
  $firstSlot = $slots | Where-Object { $_.is_booked -eq 0 } | Select-Object -First 1
} else {
  $firstSlot = $slots
}
if (-not $firstSlot) {
  Write-Host "No available slot found to book." -ForegroundColor Red
  exit 1
}
$slotIdToBook = $firstSlot.slot_id
Write-Host "Will attempt to book slot_id = $slotIdToBook (slot_at = $($firstSlot.slot_at))"

# 8) Patient books appointment
Write-Host "`n8) Patient booking appointment..."
$bookPayload = @{ doctorSlotId = $slotIdToBook }
$bookRes = ApiPost "/appointments" $bookPayload $patientToken
Write-Host "Book response:"; Pretty $bookRes

# 9) Doctor views appointments
Write-Host "`n9) Doctor fetching own appointments..."
$docAppts = ApiGet "/appointments" $doctorToken
Write-Host "Doctor appointments:"; Pretty $docAppts

# 10) Patient views own appointments
Write-Host "`n10) Patient fetching own appointments..."
$patAppts = ApiGet "/appointments/me" $patientToken
Write-Host "Patient appointments:"; Pretty $patAppts

# find appointment id created (from bookRes or patAppts)
if ($bookRes -and $bookRes.id) {
  $appointmentId = $bookRes.id
} elseif ($patAppts) {
  # choose the most recent
  $appointmentId = ($patAppts | Sort-Object scheduled_at -Descending | Select-Object -First 1).id
}
Write-Host "Using appointment id = $appointmentId"

# 11) Patient creates a lab test
Write-Host "`n11) Patient creating a lab test..."
$labPayload = @{ test_name = "Complete Blood Count"; test_date = (Get-Date).AddDays(3).ToString("yyyy-MM-dd") }
$labRes = ApiPost "/lab-tests" $labPayload $patientToken
Write-Host "Lab test created:"; Pretty $labRes

# 12) Patient lists lab tests
Write-Host "`n12) Patient listing lab tests..."
$labList = ApiGet "/lab-tests" $patientToken
Write-Host "Lab tests:"; Pretty $labList

# 13) Patient creates a calendar event
Write-Host "`n13) Patient creating calendar event..."
$eventPayload = @{
  title = "Take Vitamin"
  start_time = (Get-Date).AddDays(2).ToString("yyyy-MM-dd 08:00:00")
  end_time   = (Get-Date).AddDays(2).ToString("yyyy-MM-dd 08:15:00")
  description = "Daily supplement"
  color = "green"
  event_type = "note"
}
$eventRes = ApiPost "/calendar/events" $eventPayload $patientToken
Write-Host "Event created:"; Pretty $eventRes

# 14) Patient lists calendar events
Write-Host "`n14) Patient listing calendar events..."
$events = ApiGet "/calendar/events" $patientToken
Write-Host "Calendar events:"; Pretty $events

# 15) Cancel appointment (patient)
if ($appointmentId) {
  Write-Host "`n15) Patient canceling appointment id $appointmentId..."
  $cancelRes = ApiDelete ("/appointments/$appointmentId") $patientToken
  Write-Host "Cancel response:"; Pretty $cancelRes
} else {
  Write-Host "No appointment id found to cancel."
}

Write-Host "`nTest run finished." -ForegroundColor Green
