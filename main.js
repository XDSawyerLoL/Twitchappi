{
  "name": "oryon-operator-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node ./src/index.js",
    "start": "node ./src/index.js",
    "audit:prod": "npm audit --omit=dev",
    "verify": "node --check ./src/index.js"
  },
  "dependencies": {
    "@octokit/rest": "^21.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "node-fetch": "^3.3.2",
    "nanoid": "^5.0.7",
    "ws": "^8.17.1"
  },
  "overrides": {
    "cookie": "^0.7.2",
    "send": "^0.19.0",
    "debug": "^4.4.1"
  }
}
