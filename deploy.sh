#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy.sh — One-shot deployment script for UpCloud VPS (Ubuntu 24.04)
#
# Usage: SSH into the VPS, then run:
#   curl -sSL https://raw.githubusercontent.com/prudhvireddy20/phonix/main/deploy.sh | bash
#
# Or copy this file to the server and run: bash deploy.sh
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "══════════════════════════════════════════════════════════════"
echo "  Phonix — Production Deployment"
echo "══════════════════════════════════════════════════════════════"

# ── 1. System updates ────────────────────────────────────────────────────────
echo ""
echo "▶ Step 1/6: Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────────────────────
echo ""
echo "▶ Step 2/6: Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "  Docker installed. You may need to re-login for group changes."
else
    echo "  Docker already installed."
fi

# ── 3. Create swap file (safety net for 1GB RAM) ─────────────────────────────
echo ""
echo "▶ Step 3/6: Setting up 1GB swap file..."
if ! swapon --show | grep -q '/swapfile'; then
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    # Reduce swappiness — only use swap when necessary
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf > /dev/null
    sudo sysctl vm.swappiness=10
    echo "  Swap file created and activated."
else
    echo "  Swap already active."
fi

# ── 4. Clone the repo ────────────────────────────────────────────────────────
echo ""
echo "▶ Step 4/6: Cloning Phonix repository..."
cd /root
if [ -d "phonix" ]; then
    cd phonix
    git pull origin main
    echo "  Repository updated."
else
    git clone https://github.com/prudhvireddy20/phonix.git
    cd phonix
    echo "  Repository cloned."
fi

# ── 5. Create .env.prod ──────────────────────────────────────────────────────
echo ""
echo "▶ Step 5/6: Setting up environment..."
if [ ! -f ".env.prod" ]; then
    cat > .env.prod << 'ENVEOF'
# ── Production Environment Variables ──────────────────────────────────────────
# PostgreSQL (Neon — managed, free)
# Get your connection string from https://neon.tech
POSTGRES_DSN=YOUR_NEON_CONNECTION_STRING_HERE

# OpenRouter (LLM feedback)
# Get your key from https://openrouter.ai/keys
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY_HERE
OPENROUTER_MODEL=google/gemini-2.5-flash

# App — UPDATE with your server's public IP
ALLOWED_ORIGINS=http://YOUR_SERVER_IP,http://localhost
NEXT_PUBLIC_BACKEND_URL=
ENVEOF
    echo "  ⚠️  Created .env.prod — YOU MUST EDIT THIS FILE!"
    echo "  Run: nano .env.prod"
    echo "  Fill in: POSTGRES_DSN, OPENROUTER_API_KEY, ALLOWED_ORIGINS"
else
    echo "  .env.prod already exists."
fi

# ── 6. Build and start ───────────────────────────────────────────────────────
echo ""
echo "▶ Step 6/6: Building and starting containers..."
echo "  This will take 5-10 minutes on first run (downloads Whisper model)."
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo ""
echo "  Your app is running at: http://$(curl -s ifconfig.me)"
echo ""
echo "  Next steps:"
echo "  1. Open the URL above in your browser"
echo "  2. If it doesn't work, check logs:"
echo "     docker compose -f docker-compose.prod.yml logs -f"
echo "══════════════════════════════════════════════════════════════"
