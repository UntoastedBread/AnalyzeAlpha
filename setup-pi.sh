#!/bin/bash
# AnalyzeAlpha Raspberry Pi Setup Script
# Run on the Pi as the admin user: bash setup-pi.sh
set -e

echo "=== AnalyzeAlpha Pi Setup ==="

# 1. Install Node.js 20 LTS
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2
echo "Installing PM2..."
sudo npm install -g pm2

# 3. Install Nginx
echo "Installing Nginx..."
sudo apt-get install -y nginx

# 4. Install Certbot
echo "Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

# 5. Clone repo & install deps & build
echo "Setting up project..."
if [ ! -d ~/AnalyzeAlpha ]; then
    git clone https://github.com/YOUR_USERNAME/AnalyzeAlpha.git ~/AnalyzeAlpha
fi
cd ~/AnalyzeAlpha
npm install
npm run build

# 6. Configure Nginx
echo "Configuring Nginx..."
sudo cp ~/AnalyzeAlpha/nginx/analyzealpha.conf /etc/nginx/sites-available/analyzealpha
sudo ln -sf /etc/nginx/sites-available/analyzealpha /etc/nginx/sites-enabled/analyzealpha
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 7. Start with PM2
echo "Starting server with PM2..."
cd ~/AnalyzeAlpha
pm2 start server.js --name analyzealpha
pm2 save
pm2 startup | tail -1 | bash  # auto-start on boot

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Set up DuckDNS cron (replace SUBDOMAIN and TOKEN):"
echo "     */5 * * * * curl -s \"https://www.duckdns.org/update?domains=SUBDOMAIN&token=TOKEN&ip=\" > /dev/null"
echo ""
echo "  2. Set up SSL (after DNS is propagated and ports 80/443 are forwarded):"
echo "     sudo certbot --nginx -d analyzealpha.duckdns.org"
echo ""
echo "  3. Port forward 80 and 443 on your router to this Pi's IP"
