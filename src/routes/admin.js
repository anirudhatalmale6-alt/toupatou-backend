const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [
      reservations, operators, users, payments,
      byCategory, byStatus, recentReservations, revenue
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM reservations'),
      pool.query('SELECT COUNT(*) FROM operators WHERE active = true'),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COUNT(*) FROM payments WHERE status = 'completed'"),
      pool.query('SELECT category, COUNT(*) as count FROM reservations GROUP BY category ORDER BY count DESC'),
      pool.query('SELECT status, COUNT(*) as count FROM reservations GROUP BY status'),
      pool.query(`
        SELECT r.id, r.ref_code, r.category, r.status, r.created_at,
               u.name as user_name, u.phone as user_phone
        FROM reservations r LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.created_at DESC LIMIT 10
      `),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total, currency FROM payments WHERE status = 'completed' GROUP BY currency")
    ]);

    res.json({
      total_reservations: parseInt(reservations.rows[0].count),
      total_operators: parseInt(operators.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      completed_payments: parseInt(payments.rows[0].count),
      by_category: byCategory.rows,
      by_status: byStatus.rows,
      recent_reservations: recentReservations.rows,
      revenue: revenue.rows
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All users
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { rows } = await pool.query(
      'SELECT id, name, phone, email, role, lang, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [parseInt(limit), parseInt(offset)]
    );
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ users: rows, total: parseInt(count) });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Support tickets
router.get('/tickets', async (req, res) => {
  try {
    const { status = 'open' } = req.query;
    const { rows } = await pool.query(`
      SELECT st.*, u.name as user_name, u.phone as user_phone,
             r.ref_code, r.category
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN reservations r ON st.reservation_id = r.id
      WHERE st.status = $1
      ORDER BY st.created_at DESC
    `, [status]);
    res.json({ tickets: rows });
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create support ticket
router.post('/tickets', async (req, res) => {
  try {
    const { user_id, reservation_id, subject, message, priority } = req.body;
    const { rows: [ticket] } = await pool.query(`
      INSERT INTO support_tickets (user_id, reservation_id, subject, message, priority)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [user_id, reservation_id, subject, message, priority || 'normal']);
    res.status(201).json({ ticket });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update ticket status
router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket: rows[0] });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Analytics: reservations per day (last 30 days)
router.get('/analytics/daily', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, category
      FROM reservations
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), category
      ORDER BY date DESC
    `);
    res.json({ daily: rows });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
