const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.post('/', async (req, res) => {
  try {
    const { reservation_id, amount, currency, method, reference, proof_upload, details } = req.body;

    if (!reservation_id || !amount || !method) {
      return res.status(400).json({ error: 'reservation_id, amount, and method are required' });
    }

    const validMethods = ['moncash', 'natcash', 'credit_card', 'cash', 'bank_transfer', 'zelle'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'Invalid payment method', valid: validMethods });
    }

    const { rows: resRows } = await pool.query('SELECT * FROM reservations WHERE id = $1', [reservation_id]);
    if (resRows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const initialStatus = (method === 'cash') ? 'awaiting_confirmation' : 'pending';

    const { rows: [payment] } = await pool.query(`
      INSERT INTO payments (reservation_id, user_id, amount, currency, method, reference, proof_upload, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [
      reservation_id, resRows[0].user_id, amount, currency || 'HTG',
      method, reference, proof_upload, initialStatus, JSON.stringify(details || {})
    ]);

    await pool.query(
      "UPDATE reservations SET payment_status = 'awaiting_verification', total_amount = $1, currency = $2, updated_at = NOW() WHERE id = $3",
      [amount, currency || 'HTG', reservation_id]
    );

    res.status(201).json({ payment });
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

router.patch('/:id/verify', async (req, res) => {
  try {
    const { verified_by } = req.body;

    const { rows } = await pool.query(
      "UPDATE payments SET status = 'verified', verified_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [verified_by || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });

    await pool.query(
      "UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = NOW() WHERE id = $1",
      [rows[0].reservation_id]
    );

    res.json({ payment: rows[0] });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;

    const { rows } = await pool.query(
      "UPDATE payments SET status = 'rejected', details = details || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *",
      [JSON.stringify({ reject_reason: reason || 'Payment rejected' }), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });

    await pool.query(
      "UPDATE reservations SET payment_status = 'rejected', updated_at = NOW() WHERE id = $1",
      [rows[0].reservation_id]
    );

    res.json({ payment: rows[0] });
  } catch (err) {
    console.error('Reject payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/refund', async (req, res) => {
  try {
    const { reason } = req.body;

    const { rows } = await pool.query(
      "UPDATE payments SET status = 'refunded', details = details || $1::jsonb, updated_at = NOW() WHERE id = $2 AND status = 'verified' RETURNING *",
      [JSON.stringify({ refund_reason: reason || 'Refund processed', refunded_at: new Date().toISOString() }), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found or not verified' });

    await pool.query(
      "UPDATE reservations SET payment_status = 'refunded', status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [rows[0].reservation_id]
    );

    res.json({ payment: rows[0] });
  } catch (err) {
    console.error('Refund payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, provider_ref } = req.body;
    const validStatuses = ['pending', 'awaiting_verification', 'awaiting_confirmation', 'verified', 'rejected', 'refunded', 'failed'];
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

    if (status === 'verified') {
      await pool.query(
        "UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = NOW() WHERE id = $1",
        [rows[0].reservation_id]
      );
    }

    res.json({ payment: rows[0] });
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, method, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT p.*, r.ref_code, r.category, u.fullname as user_name, u.phone as user_phone
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

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*) FROM payments' +
      (status ? ` WHERE status = '${status}'` : '')
    );

    res.json({ payments: rows, total: parseInt(count) });
  } catch (err) {
    console.error('List payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
