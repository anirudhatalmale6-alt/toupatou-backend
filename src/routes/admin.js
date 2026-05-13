const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/stats', async (req, res) => {
  try {
    const [
      reservations, operators, users, payments,
      byCategory, byStatus, recentReservations, revenue,
      pendingOperators, pendingPayments
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM reservations'),
      pool.query('SELECT COUNT(*) FROM operators WHERE active = true'),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT COUNT(*) FROM payments WHERE status = 'verified'"),
      pool.query('SELECT category, COUNT(*) as count FROM reservations GROUP BY category ORDER BY count DESC'),
      pool.query('SELECT status, COUNT(*) as count FROM reservations GROUP BY status'),
      pool.query(`
        SELECT r.id, r.ref_code, r.category, r.status, r.payment_status, r.total_amount, r.currency, r.created_at,
               u.fullname as user_name, u.phone as user_phone, o.business_name as operator_name
        FROM reservations r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN operators o ON r.operator_id = o.id
        ORDER BY r.created_at DESC LIMIT 10
      `),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total, currency FROM payments WHERE status = 'verified' GROUP BY currency"),
      pool.query("SELECT COUNT(*) FROM operators WHERE verification_status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM payments WHERE status = 'pending' OR status = 'awaiting_verification'")
    ]);

    res.json({
      total_reservations: parseInt(reservations.rows[0].count),
      total_operators: parseInt(operators.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      completed_payments: parseInt(payments.rows[0].count),
      pending_operators: parseInt(pendingOperators.rows[0].count),
      pending_payments: parseInt(pendingPayments.rows[0].count),
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

router.get('/users', async (req, res) => {
  try {
    const { role, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT id, fullname, phone, whatsapp, email, role, language, created_at FROM users';
    const params = [];
    let idx = 1;

    if (role) {
      query += ` WHERE role = $${idx++}`;
      params.push(role);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ users: rows, total: parseInt(count) });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'operator', 'admin', 'terminal_agent', 'hero_dispatch'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role', valid: validRoles });
    }

    const { rows } = await pool.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, fullname, phone, role',
      [role, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/operators/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM operators WHERE verification_status = 'pending' ORDER BY created_at DESC"
    );
    res.json({ operators: rows });
  } catch (err) {
    console.error('Pending operators error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const { status, category } = req.query;
    let query = `
      SELECT st.*, u.fullname as user_name, u.phone as user_phone,
             r.ref_code, r.category as reservation_category
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN reservations r ON st.reservation_id = r.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status) { query += ` AND st.status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND st.category = $${idx++}`; params.push(category); }

    query += ' ORDER BY st.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ tickets: rows });
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    const { user_id, reservation_id, category, subject, message, priority } = req.body;
    const { rows: [ticket] } = await pool.query(`
      INSERT INTO support_tickets (user_id, reservation_id, category, subject, message, priority)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [user_id, reservation_id, category, subject, message, priority || 'normal']);
    res.status(201).json({ ticket });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status, assigned_to } = req.body;
    const updates = ['updated_at = NOW()'];
    const params = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (assigned_to) { updates.push(`assigned_to = $${idx++}`); params.push(assigned_to); }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket: rows[0] });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/daily', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const { rows } = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, category
      FROM reservations
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY DATE(created_at), category
      ORDER BY date DESC
    `, [parseInt(days)]);
    res.json({ daily: rows });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/revenue', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DATE(p.created_at) as date, SUM(p.amount) as total, p.currency, p.method,
             COUNT(*) as transactions
      FROM payments p
      WHERE p.status = 'verified' AND p.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(p.created_at), p.currency, p.method
      ORDER BY date DESC
    `);
    res.json({ revenue: rows });
  } catch (err) {
    console.error('Revenue analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics/operators', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.business_name, o.operator_type, o.verification_status,
             COUNT(r.id) as total_reservations,
             COUNT(CASE WHEN r.status = 'confirmed' THEN 1 END) as confirmed,
             COALESCE(SUM(CASE WHEN p.status = 'verified' THEN p.amount END), 0) as revenue
      FROM operators o
      LEFT JOIN reservations r ON o.id = r.operator_id
      LEFT JOIN payments p ON r.id = p.reservation_id
      WHERE o.active = true
      GROUP BY o.id
      ORDER BY total_reservations DESC
    `);
    res.json({ operators: rows });
  } catch (err) {
    console.error('Operator analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
