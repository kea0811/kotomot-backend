import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import routes from './routes';
import { errorHandler } from './middleware/error-handler';
import v1TranslationsRouter from './routes/v1-translations';

const app = express();

// Security
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'cache-control', 'pragma'],
}));

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(compression());
app.use(morgan('dev'));

// Routes — served at root (e.g. api.kotomot.app/projects) since the backend
// already lives on the `api.` subdomain. `/api` is kept as a backward-compatible
// alias for the existing frontend proxy and any older clients.
app.use(routes);
app.use('/api', routes);

// Health check
app.get('/health', async (_req, res) => {
  try {
    const mongoose = await import('mongoose');
    const isConnected = mongoose.default.connection.readyState === 1;
    res.json({
      status: isConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      mongodb: isConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
    });
  } catch {
    res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
  }
});

// Public SDK endpoint (API key auth handled in route)
app.use('/v1/translations', v1TranslationsRouter);

// Error handler
app.use(errorHandler);

export default app;
