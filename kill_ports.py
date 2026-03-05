import os
import subprocess
import sys

def kill_port(port):
    try:
        # Get PID using netstat
        output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
        pids = set()
        for line in output.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 5:
                # The PID is the last element
                # Check if it's actually listening on THIS port
                addr = parts[1]
                if f":{port}" in addr:
                    pid = parts[-1]
                    pids.add(pid)
        
        for pid in pids:
            print(f"Killing PID {pid} on port {port}")
            subprocess.run(f"taskkill /F /PID {pid}", shell=True)
    except subprocess.CalledProcessError:
        print(f"No process found on port {port}.")
    except Exception as e:
        print(f"Error killing port {port}: {e}")

if __name__ == "__main__":
    # Force kill any lingering python or node processes
    print("Killing all python and node processes...")
    os.system("taskkill /F /IM python.exe /T 2>NUL")
    os.system("taskkill /F /IM node.exe /T 2>NUL")
    
    kill_port(3000)
    kill_port(8000)
    kill_port(4000)
    kill_port(5173)
    print("Ports cleared.")
