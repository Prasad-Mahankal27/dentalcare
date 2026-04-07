import platform
import subprocess


def kill_port_windows(port):
    try:
        output = subprocess.check_output(
            f"netstat -ano | findstr :{port}", shell=True, stderr=subprocess.STDOUT
        ).decode()

        pids = set()
        for line in output.strip().split("\n"):
            parts = line.split()
            if len(parts) >= 5:
                addr = parts[1]
                if f":{port}" in addr:
                    pids.add(parts[-1])

        if not pids:
            print(f"No process found on port {port}.")
            return

        for pid in pids:
            print(f"Killing PID {pid} on port {port}")
            subprocess.run(["taskkill", "/F", "/PID", pid], check=False)
    except subprocess.CalledProcessError:
        print(f"No process found on port {port}.")
    except Exception as err:
        print(f"Error killing port {port}: {err}")


def kill_port_unix(port):
    try:
        output = subprocess.check_output(
            ["lsof", "-ti", f"tcp:{port}"], stderr=subprocess.STDOUT
        ).decode()
        pids = {pid.strip() for pid in output.splitlines() if pid.strip()}

        if not pids:
            print(f"No process found on port {port}.")
            return

        for pid in pids:
            print(f"Killing PID {pid} on port {port}")
            subprocess.run(["kill", "-9", pid], check=False)
    except subprocess.CalledProcessError:
        print(f"No process found on port {port}.")
    except FileNotFoundError:
        print("lsof is not available on this system; skipping port cleanup.")
    except Exception as err:
        print(f"Error killing port {port}: {err}")


def kill_port(port):
    if platform.system().lower().startswith("win"):
        kill_port_windows(port)
    else:
        kill_port_unix(port)


if __name__ == "__main__":
    print("Cleaning configured ports...")
    for target_port in (3000, 8000, 4000, 5000, 5173):
        kill_port(target_port)
    print("Ports cleared.")
