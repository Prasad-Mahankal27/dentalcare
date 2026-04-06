import os
import subprocess

def kill_port(port):
    try:
        # Get PID using lsof on macOS/Linux
        output = subprocess.check_output(["lsof", "-t", f"-i:{port}"]).decode().strip()
        if output:
            pids = output.split('\n')
            for pid in pids:
                print(f"Killing PID {pid} on port {port}")
                subprocess.run(["kill", "-9", pid])
    except subprocess.CalledProcessError:
        # lsof returns exit code 1 if no process found
        print(f"No process found on port {port}.")
    except Exception as e:
        print(f"Error killing port {port}: {e}")

if __name__ == "__main__":
    # Force kill lingering python and node processes by name
    print("Cleaning up lingering processes...")
    try:
        subprocess.run(["pkill", "-f", "node"], stderr=subprocess.DEVNULL)
        subprocess.run(["pkill", "-f", "python"], stderr=subprocess.DEVNULL)
    except:
        pass
    
    ports = [3000, 3002, 4000, 5173, 8000]
    for port in ports:
        kill_port(port)
        
    print("Ports cleared.")
