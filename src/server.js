require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { initDatabase } = require('./db/init');
const reservationsRouter = require('./routes/reservations');
const operatorsRouter = require('./routes/operators');
const searchRouter = require('./routes/search');
const paymentsRouter = require('./routes/payments');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/reservations', reservationsRouter);
app.use('/api/operators', operatorsRouter);
app.use('/api/search', searchRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TouPaTou Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'TouPaTou API',
    tagline: 'Yon Platfom. Tout Rezervasyon.',
    version: '1.0.0',
    endpoints: {
      reservations: {
        'POST /api/reservations': 'Create a reservation',
        'GET /api/reservations': 'List all reservations (admin)',
        'GET /api/reservations/:id': 'Get reservation by ID',
        'GET /api/reservations/ref/:refCode': 'Get reservation by reference code',
        'GET /api/reservations/user/:phone': 'Get user reservations by phone',
        'PATCH /api/reservations/:id/status': 'Update reservation status',
        'POST /api/reservations/verify': 'Verify reservation by PIN'
      },
      operators: {
        'GET /api/operators': 'List operators',
        'POST /api/operators': 'Register operator',
        'GET /api/operators/:id': 'Get operator',
        'PATCH /api/operators/:id': 'Update operator',
        'PATCH /api/operators/:id/verify': 'Verify operator (admin)',
        'GET /api/operators/:id/reservations': 'Get operator reservations'
      },
      search: {
        'GET /api/search/hotels': 'Search hotels (city, stars)',
        'GET /api/search/buses': 'Search bus routes (from, to)',
        'GET /api/search/events': 'Search events (city, category)',
        'GET /api/search/maritime': 'Search maritime routes (from, to)'
      },
      payments: {
        'POST /api/payments': 'Record payment (moncash, natcash, credit_card, cash, zelle)',
        'GET /api/payments': 'List all payments (admin)',
        'GET /api/payments/reservation/:id': 'Get reservation payments',
        'PATCH /api/payments/:id/status': 'Update payment status'
      },
      admin: {
        'GET /api/admin/stats': 'Dashboard statistics',
        'GET /api/admin/users': 'List all users',
        'GET /api/admin/tickets': 'Support tickets',
        'POST /api/admin/tickets': 'Create support ticket',
        'PATCH /api/admin/tickets/:id': 'Update ticket status',
        'GET /api/admin/analytics/daily': 'Daily reservation analytics'
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`TouPaTou API running on port ${PORT}`);
      console.log(`Endpoints: http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
