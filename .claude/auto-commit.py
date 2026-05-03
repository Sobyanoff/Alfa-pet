import sys, json, subprocess, os

d = json.load(sys.stdin)
f = d.get('tool_input', {}).get('file_path', '')
if not f:
    sys.exit(0)

subprocess.run(['git', 'add', f], capture_output=True)
r = subprocess.run(['git', 'diff', '--cached', '--name-only'], capture_output=True, text=True)
if r.stdout.strip():
    name = os.path.basename(f)
    subprocess.run(['git', 'commit', '-m', 'auto: update ' + name], capture_output=True)
    subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True)
