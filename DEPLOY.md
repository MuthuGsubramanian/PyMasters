# 🚀 PyMasters Live Deployment Guide

To make **PyMasters** live at `www.pymasters.net`, follow these steps.

## 1. Prerequisites
You need:
*   **A Domain Name**: You already have `pymasters.net`.
*   **A Cloud Server (VPS)**: A virtual machine running Linux (Ubuntu 22.04 LTS recommended) with a Public IP address.
    *   *Providers*: DigitalOcean, AWS EC2, Vultr, Linode, etc.
    *   *Specs*: 2 vCPU, 4GB RAM recommended (for AI handling).

## 2. DNS Configuration
Log in to your domain registrar (GoDaddy, Namecheap, etc.) and manage DNS for `pymasters.net`.
Create an **A Record**:
*   **Host**: `@` (or `www`)
*   **Value**: `<YOUR_SERVER_PUBLIC_IP>` (e.g., `203.0.113.10`)
*   **TTL**: `3600` (or automatic)

## 3. Server Setup
SSH into your server and install Docker:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker
```

## 4. Deploying the Code
You can copy your project files to the server using `scp` or `git`.

### Option A: Using Git (Recommended)
1.  Push your code to a private GitHub repo.
2.  Clone it on the server:
    ```bash
    git clone https://github.com/your-username/pymasters.git
    cd pymasters
    ```

### Option B: Manual Copy
Copy the `PyMasters` folder to the server.

## 5. Launching the App
On the server, inside the project folder:

1.  **Stop any existing services** on port 80.
2.  **Build and Run**:
    ```bash
    sudo docker-compose up --build -d
    ```

This will start:
*   **Frontend**: Accessible at `http://www.pymasters.net` (Port 80).
*   **Backend**: Internal API.
*   **Database**: Persistent DuckDB volume.

## 6. (Optional) Enabling SSL (HTTPS)
For a secure `https://` connection:
1.  Install Certbot and Nginx:
    ```bash
    sudo apt install nginx certbot python3-certbot-nginx
    ```
2.  Configure Nginx as a reverse proxy instead of letting Docker bind Port 80 directly (requires editing docker-compose to bind to localhost:port instead).
    *   *Alternative*: Use **Nginx Proxy Manager** docker container for easy SSL.

---
**Your PyMasters platform is now live!** 🚀
