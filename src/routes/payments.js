const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Record a payment
router.post('/', async (req, res) => {
  try {
    const { reservation_id, amount, currency, method, reference } = req.body;

    if (!reservation_id || !amount || !method) {
      return res.status(400).json({ error: 'reservation_id, amount, and method are required' });
    }

    const validMethods = ['moncash', 'natcash', 'credit_card', 'cash', 'zelle'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method', valid: validMethods });
    }

    // Verify reservation exists
    const { rows: resRows } = await pool.query('SELECT * FROM reservations WHERE id = $1', [reservation_id]);
    if (resRows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const { rows: [payment] } = await pool.query(`
      INSERT INTO payments (reservation_id, user_id, amount, currency, method, reference, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [reservation_id, resRows[0].user_id, amount, currency || 'HTG', method, reference, 'pending']);

    // Update reservation total
    await pool.query(
      'UPDATE reservations SET total_amount = total_amount + $1, currency = $2, updated_at = NOW() WHERE id = $3',
      [amount, currency || 'HTG', reservation_id]
    );

    res.status(201).json({ payment });
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get payments for a reservation
router.get('/reservation/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM payments WHERE reservation_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ payments: rows });
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update payment status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, provider_ref } = req.body;
    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let idx = 2;

    if (provider_ref) {
      updates.push(`provider_ref = $${idx++}`);
      params.push(provider_ref);
    }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE payments SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });

    // If payment completed, confirm reservation
    if (status === 'completed') {
      await pool.query(
        "UPDATE reservations SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND status = 'pending'",
        [rows[0].reservation_id]
      );
    }

    res.json({ payment: rows[0] });
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all payments (admin)
router.get('/', async (req, res) => {
  try {
    const { status, method, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT p.*, r.ref_code, r.category, u.name as user_name, u.phone as user_phone
      FROM payments p
      LEFT JOIN reservations r ON p.reservation_id = r.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status) { query += ` AND p.status = $${idx++}`; params.push(status); }
    if (method) { query += ` AND p.method = $${idx++}`; params.push(method); }

    query += ` ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    res.json({ payments: rows });
  } catch (err) {
    console.error('List payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
