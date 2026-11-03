#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

APP_DIR="/home/ec2-user/prowlet"
BACKEND_DIR="$APP_DIR/prowlet-backend"
PUBLIC_URL="${PUBLIC_URL:-http://13.61.14.227}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@prowlet.local}"
PUBLIC_HOST="${PUBLIC_URL#http://}"
PUBLIC_HOST="${PUBLIC_HOST#https://}"
PUBLIC_HOST="${PUBLIC_HOST%%/*}"
FIRST_INSTALL=0

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Expected the GitHub checkout at $APP_DIR. Clone it before running bootstrap." >&2
  exit 1
fi

dnf install -y nodejs npm postgresql-server postgresql nginx git curl policycoreutils

if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 20 ]]; then
  echo "Node.js 20 or newer is required; the installed version is $(node --version 2>/dev/null || echo missing)." >&2
  exit 1
fi

if [[ ! -f /var/lib/pgsql/data/PG_VERSION ]]; then
  postgresql-setup --initdb
fi
systemctl enable --now postgresql

install -d -o ec2-user -g ec2-user -m 0750 "$APP_DIR" "$BACKEND_DIR/storage"
install -d -o root -g root -m 0700 /etc/prowlet

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  FIRST_INSTALL=1
  DB_PASSWORD="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 48)"
  ADMIN_PASSWORD="$(openssl rand -hex 24)"
  cat > "$BACKEND_DIR/.env" <<EOF
NODE_ENV=production
PORT=4000
FRONTEND_URL=$PUBLIC_URL
FRONTEND_PUBLIC_URL=$PUBLIC_URL
JWT_SECRET=$JWT_SECRET
DATABASE_URL=postgresql://prowlet_app:$DB_PASSWORD@127.0.0.1:5432/prowlet
DATABASE_SSL=false
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
BLOCKCHAIN_MODE=mock
PROGRAM_ID=Hi76RFfVSD82bW3KLhUYWw5rLRf4xVLrS5JzdYEgKdcB
UPLOAD_DIR=$BACKEND_DIR/storage
MAX_BATCH_SIZE=1000
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chmod 600 "$BACKEND_DIR/.env"
  chown ec2-user:ec2-user "$BACKEND_DIR/.env"
  cat > /etc/prowlet/initial-admin.txt <<EOF
Initial Prowlet administrator
Email: $ADMIN_EMAIL
Password: $ADMIN_PASSWORD

Delete this file after safely saving the password and confirming login.
EOF
  chmod 600 /etc/prowlet/initial-admin.txt
else
  echo "Keeping the existing backend environment file."
fi

cat > "$APP_DIR/.env.production.local" <<EOF
NEXT_PUBLIC_PROWLET_API_URL=$PUBLIC_URL/api
EOF
chmod 600 "$APP_DIR/.env.production.local"
chown ec2-user:ec2-user "$APP_DIR/.env.production.local"

DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$BACKEND_DIR/.env")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is missing from $BACKEND_DIR/.env." >&2
  exit 1
fi
DB_PASSWORD="${DATABASE_URL#*://prowlet_app:}"
DB_PASSWORD="${DB_PASSWORD%%@*}"
if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "$DATABASE_URL" ]]; then
  echo "DATABASE_URL must use the dedicated prowlet_app PostgreSQL role." >&2
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -v dbpass="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE prowlet_app LOGIN PASSWORD %L', :'dbpass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prowlet_app') \gexec
ALTER ROLE prowlet_app WITH LOGIN PASSWORD :'dbpass';
SELECT 'CREATE DATABASE prowlet OWNER prowlet_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'prowlet') \gexec
SQL

runuser -u ec2-user -- bash -lc "cd '$APP_DIR' && npm ci && npm run build"
runuser -u ec2-user -- bash -lc "cd '$BACKEND_DIR' && npm ci && npm run api:build && npm run db:migrate"

if [[ "$FIRST_INSTALL" -eq 1 ]]; then
  runuser -u ec2-user -- bash -lc "cd '$BACKEND_DIR' && npm run db:create-admin"
  sed -i '/^ADMIN_PASSWORD=/d' "$BACKEND_DIR/.env"
  chmod 600 "$BACKEND_DIR/.env"
fi

runuser -u ec2-user -- bash -lc "cd '$APP_DIR' && npm prune --omit=dev"
runuser -u ec2-user -- bash -lc "cd '$BACKEND_DIR' && npm prune --omit=dev"

install -o root -g root -m 0600 "$BACKEND_DIR/.env" /etc/prowlet/backend.env

cat > /etc/systemd/system/prowlet-api.service <<EOF
[Unit]
Description=Prowlet API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=/etc/prowlet/backend.env
ExecStart=/usr/bin/node dist/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$BACKEND_DIR/storage

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/prowlet-web.service <<EOF
[Unit]
Description=Prowlet Next.js frontend
After=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/conf.d/prowlet.conf <<EOF
server {
    listen 80;
    server_name $PUBLIC_HOST;

    client_max_body_size 6m;
    server_tokens off;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

cat > /etc/sudoers.d/prowlet-deploy <<'EOF'
ec2-user ALL=(root) NOPASSWD: /usr/bin/install -o root -g root -m 0600 /home/ec2-user/prowlet/prowlet-backend/.env /etc/prowlet/backend.env, /usr/bin/systemctl restart prowlet-api.service, /usr/bin/systemctl restart prowlet-web.service, /usr/bin/systemctl is-active prowlet-api.service, /usr/bin/systemctl is-active prowlet-web.service
EOF
chmod 440 /etc/sudoers.d/prowlet-deploy
visudo -cf /etc/sudoers.d/prowlet-deploy

cat > /usr/local/sbin/prowlet-deploy <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /usr/sbin/runuser -u ec2-user -- /usr/bin/bash /home/ec2-user/prowlet/scripts/deploy-ec2.sh
EOF
chown root:root /usr/local/sbin/prowlet-deploy
chmod 750 /usr/local/sbin/prowlet-deploy

if ! systemctl list-unit-files amazon-ssm-agent.service --no-legend | grep -q amazon-ssm-agent; then
  SSM_RPM="$(mktemp /tmp/amazon-ssm-agent.XXXXXX.rpm)"
  curl --fail --silent --show-error --location \
    "https://s3.eu-north-1.amazonaws.com/amazon-ssm-eu-north-1/latest/linux_amd64/amazon-ssm-agent.rpm" \
    --output "$SSM_RPM"
  dnf install -y "$SSM_RPM"
  rm -f "$SSM_RPM"
fi

setsebool -P httpd_can_network_connect 1
nginx -t
systemctl daemon-reload
systemctl enable --now prowlet-api prowlet-web nginx amazon-ssm-agent
systemctl restart prowlet-api prowlet-web nginx

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4000/health >/dev/null &&
     curl --fail --silent http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "Prowlet did not become healthy; inspect systemctl status and journalctl for prowlet-api and prowlet-web." >&2
    exit 1
  fi
  sleep 2
done

echo "Bootstrap complete. Verify the instance is an SSM managed node and allow inbound TCP/80 in its security group."
echo "The initial administrator credentials are stored in /etc/prowlet/initial-admin.txt (read with sudo); remove the file after saving them."
if [[ "$PUBLIC_URL" == http://* ]]; then
  echo "WARNING: $PUBLIC_URL uses unencrypted HTTP. Do not enter real passwords or use this for production accounts."
fi
