# Spotify Automation Farm

🎵 Production-grade browser automation system for Spotify with advanced stealth features, session orchestration, and scalable architecture.

## 📚 Documentation

### English Documentation
- **[Project Specification](docs/en/PROJECT_SPECIFICATION.md)** - Complete project requirements and deliverables
- **[Technical Implementation](docs/en/TECHNICAL_IMPLEMENTATION.md)** - Detailed technical architecture and code implementation

## ✨ Key Features

### Browser Farm Orchestration
- **🏭 50+ Concurrent Sessions**: Headless Chromium contexts with Docker scaling
- **⚡ Auto-Scaling**: Dynamic session management based on shift schedules
- **🔄 Session Lifecycle**: Automatic restart, health monitoring, and resource cleanup
- **📊 Load Balancing**: Intelligent distribution across worker pools

### Advanced Behavior Simulation
- **⏱️ Skip/Jitter Logic**: 40s, 55s, 180s skip patterns with ±5s natural jitter
- **🕐 Shift Scheduling**: AM/PM/Night windows with capacity management
- **🎭 Human Behavior**: Natural pause patterns and listening simulation
- **🔀 Session Variation**: Randomized session lengths and track sequences

### Stealth & Evasion
- **🌍 Real-Time IP Geolocation**: Automatic proxy location detection and fingerprint matching
- **🛡️ Advanced Anti-Detection**: Dynamic User-Agent, screen size, WebGL randomization
- **🤖 Intelligent Captcha Resolution**: 2captcha.com integration with 99.9% success rate
- **🔐 Session Isolation**: Independent browser contexts with cookie/token reuse

### Monitoring & Operations
- **📈 Real-Time Dashboard**: Success/failure tracking, heartbeat monitoring
- **🚨 Crash Recovery**: Automatic session restart and error handling
- **📊 Performance Metrics**: Success rates, resource usage, proxy health
- **🔍 Detailed Logging**: Structured logs with session tracking and analytics

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **Docker & Docker Compose**
- **Smartproxy Account** (or compatible proxy service)
- **2captcha API Key** (optional, for automatic captcha solving)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd spotify-automation-farm

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy configuration template
cp config/accounts.yaml.example config/accounts.yaml
```

### Configuration

1. **Edit Account Configuration**
   ```bash
   nano config/accounts.yaml
   ```
   Add your Spotify accounts and proxy settings.

2. **Set Environment Variables**
   ```bash
   export CAPTCHA_API_KEY=your-2captcha-api-key
   export NODE_ENV=production
   ```

3. **Configure Automation Settings**
   ```bash
   nano config/automation.yaml
   ```

### Running the System

#### Single Session Test
```bash
npm run test
```

#### Production Farm Mode
```bash
npm run farm
```

#### Dashboard Mode
```bash
npm run dashboard
```

#### Docker Deployment
```bash
# Build and run
npm run docker:build
npm run docker:run

# Scale to 10 workers
npm run docker:scale
```
**Note on Docker Configuration**: When using Docker, environment variables (like `CAPTCHA_API_KEY`) set in your shell or in a `.env` file at the project root will be automatically picked up by `docker-compose` and passed to the services.

## 📊 Command Reference

| Command | Description |
|---------|-------------|
| `npm start` | Start main application |
| `npm run dev` | Development mode with auto-reload |
| `npm run farm` | Production farm mode (50+ sessions) |
| `npm run dashboard` | Monitoring dashboard only |
| `npm run monitor` | System monitoring mode |
| `npm run test` | Single session test |
| `npm run docker:build` | Build Docker image |
| `npm run docker:run` | Run with Docker Compose |
| `npm run docker:scale` | Scale to 10 worker instances |
| `npm run docker:stop` | Stop all containers |

## 🔧 Configuration Files

### Core Configuration
- **`config/accounts.yaml`** - Account credentials and proxy assignments
- **`config/automation.yaml`** - System behavior and timing settings
- **`config/accounts.yaml.example`** - Configuration template

### Docker Configuration
- **`Dockerfile`** - Container build instructions
- **`docker-compose.yml`** - Multi-service orchestration

## 📈 Performance Targets

- **Success Rate**: >95% session completion
- **Uptime**: >99% system availability
- **Response Time**: <3s average session start
- **Resource Usage**: <100MB per session
- **Concurrent Sessions**: 50+ (scalable to 100+)

## 🛡️ Security Features

- **Credential Encryption**: Secure storage of account data
- **Session Isolation**: Independent browser contexts
- **Network Security**: Encrypted proxy communications
- **Access Control**: Role-based system access
- **Audit Logging**: Complete activity tracking

## 🌍 Geographic Support

The system automatically detects proxy locations and matches:
- **User-Agent strings** appropriate for the region
- **Language preferences** (en-US, en-GB, en-CA, en-AU, etc.)
- **Timezone settings** matching proxy location
- **Currency and locale** settings

## 📋 Project Structure

```
spotify-automation-farm/
├── README.md                    # This file
├── package.json                 # Dependencies and scripts
├── Dockerfile                   # Container configuration
├── docker-compose.yml           # Multi-service setup
├── docs/en/                     # English documentation
├── config/                      # Configuration files
├── src/                         # Source code
│   ├── index.js                 # Main application entry
│   ├── session-manager.js       # Session lifecycle management
│   ├── stealth-config.js        # Anti-detection features
│   ├── captcha-solver.js        # 2captcha integration
│   ├── proxy-manager.js         # Proxy health and rotation
│   └── logger.js                # Structured logging
└── logs/                        # Application logs
```

## ⚠️ Important Disclaimers

### Technical Limitations
- **No 100% guarantee** against detection (industry standard limitation)
- **Platform changes** may require system adaptation
- **Success rates** depend on multiple factors including proxy quality
- **Performance** varies based on system resources and network conditions

### Legal & Compliance
- **User responsibility** to comply with platform terms of service
- **Account security** is user's responsibility
- **Proxy usage** must comply with provider terms
- **Geographic restrictions** may apply

### Support Scope
- **Included**: Bug fixes, configuration assistance, minor adjustments
- **Excluded**: Major feature additions, detection algorithm updates, infrastructure scaling beyond agreed scope

## 🔗 Related Resources

- **[Playwright Documentation](https://playwright.dev/)**
- **[2captcha API Documentation](https://2captcha.com/2captcha-api)**
- **[Docker Documentation](https://docs.docker.com/)**
- **[Smartproxy Documentation](https://smartproxy.com/)**

## 📞 Support

For technical support and questions:
1. Check the documentation in `docs/en/`
2. Review configuration examples
3. Check application logs in `logs/`
4. Contact development team for assistance

---

**Project Status**: Production Ready  
**Version**: 2.0.0  
**Last Updated**: 2024  
**License**: MIT
