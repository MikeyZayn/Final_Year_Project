$frontend = "C:\Users\wandi\OneDrive - University of Zululand - Students\Pictures\Desktop\TEMBA\frontend"
$backend = "C:\Users\wandi\OneDrive - University of Zululand - Students\Pictures\Desktop\TEMBA\backend"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontend'; npm.cmd run dev -- --host 0.0.0.0"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backend'; python manage.py runserver"

Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend: http://localhost:8000"
