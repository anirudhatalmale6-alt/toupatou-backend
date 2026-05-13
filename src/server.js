require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { initDatabase } = require('./db/init');
const authRouter = require('./routes/auth');
const reservationsRouter = require('./routes/reservations');
const operatorsRouter = require('./routes/operators');
const searchRouter = require('./routes/search');
const paymentsRouter = require('./routes/payments');
const manifestsRouter = require('./routes/manifests');
const scanRouter = require('./routes/scan');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/operators', operatorsRouter);
app.use('/api/search', searchRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/manifests', manifestsRouter);
app.use('/api/scan', scanRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TouPaTou Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'TouPaTou API',
    tagline: 'Yon Platfom. Tout Rezervasyon.',
    version: '2.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register user (phone, password, fullname)',
        'POST /api/auth/login': 'Login user (phone, password) → token',
        'POST /api/auth/operator/register': 'Register operator (business_name, type, phone, password)',
        'POST /api/auth/operator/login': 'Login operator (phone, password) → token',
        'GET /api/auth/me': 'Get current user (Bearer token)'
      },
      reservations: {
        'POST /api/reservations': 'Create reservation',
        'GET /api/reservations': 'List reservations (admin)',
        'GET /api/reservations/:id': 'Get by ID',
        'GET /api/reservations/ref/:refCode': 'Get by reference code',
        'GET /api/reservations/user/:phone': 'Get user reservations',
        'PATCH /api/reservations/:id/status': 'Update status',
        'POST /api/reservations/verify': 'Verify by PIN'
      },
      operators: {
        'GET /api/operators': 'List operators (?type, ?city, ?verified)',
        'POST /api/operators': 'Register operator',
        'GET /api/operators/:id': 'Get operator',
        'PATCH /api/operators/:id': 'Update operator',
        'PATCH /api/operators/:id/verify': 'Verify operator (admin)',
        'GET /api/operators/:id/reservations': 'Get operator reservations',
        'GET /api/operators/:id/manifests': 'Get operator manifests'
      },
      search: {
        'GET /api/search/hotels': 'Search hotels (?city, ?stars)',
        'GET /api/search/buses': 'Search bus routes (?from, ?to)',
        'GET /api/search/events': 'Search events (?city, ?category)',
        'GET /api/search/maritime': 'Search maritime routes (?from, ?to)'
      },
      payments: {
        'POST /api/payments': 'Record payment (moncash, natcash, credit_card, cash, bank_transfer, zelle)',
        'GET /api/payments': 'List all payments (admin)',
        'GET /api/payments/reservation/:id': 'Get reservation payments',
        'PATCH /api/payments/:id/verify': 'Verify payment (admin)',
        'PATCH /api/payments/:id/reject': 'Reject payment (admin)',
        'PATCH /api/payments/:id/refund': 'Refund payment (admin)',
        'PATCH /api/payments/:id/status': 'Update payment status'
      },
      manifests: {
        'POST /api/manifests': 'Create manifest',
        'GET /api/manifests': 'List manifests (?operator_id, ?status, ?date)',
        'GET /api/manifests/:id': 'Get manifest',
        'PATCH /api/manifests/:id/status': 'Update manifest status',
        'POST /api/manifests/:id/board': 'Board passenger',
        'PATCH /api/manifests/:id': 'Update manifest details'
      },
      scan: {
        'POST /api/scan/validate': 'Validate QR/ref code',
        'POST /api/scan/board': 'Mark as boarded',
        'GET /api/scan/history': 'Scan history (?scanner_id)'
      },
      admin: {
        'GET /api/admin/stats': 'Dashboard statistics',
        'GET /api/admin/users': 'List users (?role)',
        'PATCH /api/admin/users/:id/role': 'Change user role',
        'GET /api/admin/operators/pending': 'Pending operators',
        'GET /api/admin/tickets': 'Support tickets',
        'POST /api/admin/tickets': 'Create ticket',
        'PATCH /api/admin/tickets/:id': 'Update ticket',
        'GET /api/admin/analytics/daily': 'Daily reservation analytics',
        'GET /api/admin/analytics/revenue': 'Revenue analytics',
        'GET /api/admin/analytics/operators': 'Operator analytics'
      }
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`TouPaTou API v2.0 running on port ${PORT}`);
      console.log(`Endpoints: http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
