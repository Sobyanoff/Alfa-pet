import paramiko
import time
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

HOST = '85.198.87.155'
USER = 'root'
PASSWORD = 'wQ*vH1*Q&P5Q'
REPO = 'https://github.com/Sobyanoff/Alfa-pet.git'
APP_DIR = '/var/www/alfa-tracker'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

def run(cmd, timeout=120, show=True):
    print(f'\n>>> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if show and out:
        print(out)
    if show and err:
        print('[STDERR]', err)
    return out, err

def run_long(cmd, timeout=300):
    print(f'\n>>> {cmd}')
    transport = client.get_transport()
    chan = transport.open_session()
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    output = []
    while not chan.exit_status_ready():
        if chan.recv_ready():
            chunk = chan.recv(4096).decode('utf-8', errors='replace')
            print(chunk, end='', flush=True)
            output.append(chunk)
        time.sleep(0.5)
    while chan.recv_ready():
        chunk = chan.recv(4096).decode('utf-8', errors='replace')
        print(chunk, end='', flush=True)
        output.append(chunk)
    exit_code = chan.recv_exit_status()
    print(f'\n[exit code: {exit_code}]')
    return ''.join(output), exit_code

print('=== ШАГ 1: Проверка системы ===')
run('cat /etc/os-release | head -3')
run('uname -m')
run('free -h')

print('\n=== ШАГ 2: Обновление apt и установка базовых пакетов ===')
run_long('apt-get update -qq')
run_long('apt-get install -y -qq curl git nginx')

print('\n=== ШАГ 3: Установка Node.js 20 ===')
out, _ = run('node --version 2>/dev/null || echo "none"')
if '20' in out or '22' in out or '18' in out:
    print(f'Node.js уже установлен: {out}')
else:
    run_long('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -')
    run_long('apt-get install -y nodejs')

run('node --version')
run('npm --version')

print('\n=== ШАГ 4: Клонирование репозитория ===')
out, _ = run(f'test -d {APP_DIR} && echo "exists" || echo "new"')
if 'exists' in out:
    print('Папка уже есть — делаю git pull')
    run(f'cd {APP_DIR} && git pull')
else:
    run_long(f'git clone {REPO} {APP_DIR}')

run(f'ls {APP_DIR}')

print('\n=== ШАГ 5: Установка npm зависимостей ===')
run_long(f'cd {APP_DIR} && npm install --production')

print('\n=== ШАГ 6: Инициализация базы данных ===')
out, _ = run(f'test -f {APP_DIR}/alfa_tracker.db && echo "exists" || echo "new"')
if 'exists' in out:
    print('БД уже существует, пропускаю init')
else:
    run_long(f'cd {APP_DIR} && node database/init.js')

print('\n=== ШАГ 7: Установка и настройка PM2 ===')
run_long('npm install -g pm2')
run(f'cd {APP_DIR} && pm2 delete alfa-tracker 2>/dev/null || true')
run_long(
    f'cd {APP_DIR} && '
    f'PORT=3000 NODE_ENV=production '
    f'JWT_SECRET=alfa-tracker-secret-2026 '
    f'pm2 start server.js --name alfa-tracker'
)
run('pm2 save')
run_long('pm2 startup systemd -u root --hp /root | tail -1 | bash || true')
run('pm2 list')

print('\n=== ШАГ 8: Настройка Nginx ===')
nginx_conf = '''server {
    listen 80;
    server_name 85.198.87.155;

    client_max_body_size 10m;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}'''

stdin, _, _ = client.exec_command('cat > /etc/nginx/sites-available/alfa-tracker')
stdin.write(nginx_conf)
stdin.channel.shutdown_write()
time.sleep(1)

run('ln -sf /etc/nginx/sites-available/alfa-tracker /etc/nginx/sites-enabled/alfa-tracker')
run('rm -f /etc/nginx/sites-enabled/default')
run('nginx -t')
run('systemctl reload nginx')
run('systemctl enable nginx')

print('\n=== ШАГ 9: Проверка ===')
time.sleep(3)
run('pm2 list')
run('curl -s http://localhost:3000/api/health')
run('systemctl status nginx --no-pager | head -5')

print('\n=== ГОТОВО ===')
print(f'Сайт доступен по адресу: http://{HOST}')

client.close()
