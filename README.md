# Map Choice Backend

TypeScript Express backend API for Expo React Native application.

## 🚀 Features

- **TypeScript** - Type-safe code with full TypeScript support
- **Express.js** - Fast, unopinionated web framework
- **CORS** - Configured for React Native/Expo frontend
- **Security** - Helmet middleware for security headers
- **Logging** - Morgan for HTTP request logging
- **Error Handling** - Centralized error handling middleware
- **Development** - Hot reload with ts-node-dev
- **Code Quality** - ESLint with TypeScript support

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd map_choice_backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your `.env` file:
```env
PORT=3000
NODE_ENV=development
```

## 🏃 Running the Application

### Development Mode (with hot reload)
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## 📁 Project Structure

```
map_choice_backend/
├── src/
│   ├── controllers/       # Request handlers
│   │   ├── userController.ts
│   │   └── itemController.ts
│   ├── routes/           # API routes
│   │   ├── index.ts
│   │   ├── userRoutes.ts
│   │   └── itemRoutes.ts
│   ├── middleware/       # Custom middleware
│   │   └── errorHandler.ts
│   ├── types/           # TypeScript types
│   │   └── index.ts
│   └── index.ts         # Application entry point
├── dist/                # Compiled JavaScript (generated)
├── .env                 # Environment variables
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## 🔌 API Endpoints

### Health Check
- `GET /health` - Server health status

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Items
- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get item by ID
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

## 📝 API Response Format

All endpoints return responses in the following format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error message"
}
```

## 🔧 VS Code Tasks

Press `Cmd+Shift+B` (Mac) or `Ctrl+Shift+B` (Windows/Linux) to run:
- **npm: dev** - Start development server (default)
- **npm: build** - Build for production
- **npm: start** - Start production server

## 🌐 Connecting to Expo App

1. Ensure your backend is running on the same network as your mobile device
2. Update your Expo app's API endpoint to point to your local IP:
   ```typescript
   const API_URL = 'http://YOUR_LOCAL_IP:3000/api';
   ```
3. CORS is already configured to accept requests from any origin

## 🔒 Environment Variables

| Variable | Description      | Default     |
| -------- | ---------------- | ----------- |
| PORT     | Server port      | 3000        |
| NODE_ENV | Environment mode | development |

## 🚧 TODO

- [ ] Add database integration (MongoDB, PostgreSQL, etc.)
- [ ] Implement authentication & authorization (JWT)
- [ ] Add input validation (express-validator or Zod)
- [ ] Add API documentation (Swagger/OpenAPI)
- [ ] Add unit and integration tests
- [ ] Set up Docker containerization
- [ ] Add rate limiting
- [ ] Implement logging to file

## 📦 Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Security**: Helmet
- **CORS**: cors
- **Logging**: morgan
- **Environment**: dotenv
- **Dev Tools**: ts-node-dev, ESLint

## 📄 License

MIT

## 👤 Author

Your Name

---

**Note**: This is a starter template with mock data. Replace the TODO comments in controllers with actual database operations for production use.
# map_choice_be
