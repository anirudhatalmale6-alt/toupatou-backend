const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateQR, generateRefCode, generatePIN } = require('../services/qr');

router.post('/', async (req, res) => {
  try {
    const { category, phone, fullname, details, passengers, route, source } = req.body;

    if (!category || !phone) {
      return res.status(400).json({ error: 'category and phone are required' });
    }

    let user;
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.length > 0) {
      user = existing[0];
      if (fullname && !user.fullname) {
        await pool.query('UPDATE users SET fullname = $1 WHERE id = $2', [fullname, user.id]);
      }
    } else {
      const { rows: [newUser] } = await pool.query(
        'INSERT INTO users (fullname, phone, whatsapp) VALUES ($1, $2, $3) RETURNING *',
        [fullname || null, phone, phone]
      );
      user = newUser;
    }

    const refCode = generateRefCode(category);
    const pin = generatePIN();
    const qrData = await generateQR({ ref: refCode, cat: category, pin });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const { rows: [reservation] } = await pool.query(`
      INSERT INTO reservations (ref_code, user_id, category, details, passengers, route, pin, qr_code, source, booking_date, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      refCode, user.id, category,
      JSON.stringify(details || {}),
      passengers || 1,
      route || (details?.from && details?.to ? `${details.from} → ${details.to}` : null),
      pin, qrData,
      source || 'web',
      details?.date ? new Date(details.date) : new Date(),
      expiresAt
    ]);

    res.status(201).json({
      success: true,
      reservation: {
        id: reservation.id,
        ref_code: reservation.ref_code,
        category: reservation.category,
        status: reservation.status,
        payment_status: reservation.payment_status,
        pin: reservation.pin,
        qr_code: reservation.qr_code,
        details: reservation.details,
        route: reservation.route,
        booking_date: reservation.booking_date,
        expires_at: reservation.expires_at,
        created_at: reservation.created_at
      }
    });
  } catch (err) {
    console.error('Create reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { category, status, payment_status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT r.*, u.fullname as user_name, u.phone as user_phone,
             o.business_name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (category) { query += ` AND r.category = $${idx++}`; params.push(category); }
    if (status) { query += ` AND r.status = $${idx++}`; params.push(status); }
    if (payment_status) { query += ` AND r.payment_status = $${idx++}`; params.push(payment_status); }

    query += ` ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);

    const countQuery = 'SELECT COUNT(*) FROM reservations' +
      (category ? ` WHERE category = '${category}'` : '') +
      (status ? ` ${category ? 'AND' : 'WHERE'} status = '${status}'` : '');
    const { rows: [{ count }] } = await pool.query(countQuery);

    res.json({ reservations: rows, total: parseInt(count) });
  } catch (err) {
    console.error('List reservations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ref/:refCode', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.fullname as user_name, u.phone as user_phone,
             o.business_name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE r.ref_code = $1
    `, [req.params.refCode]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json({ reservation: rows[0] });
  } catch (err) {
    console.error('Get reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/user/:phone', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, o.business_name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE u.phone = $1
      ORDER BY r.created_at DESC
    `, [req.params.phone]);
    res.json({ reservations: rows });
  } catch (err) {
    console.error('Get user reservations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.fullname as user_name, u.phone as user_phone,
             o.business_name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json({ reservation: rows[0] });
  } catch (err) {
    console.error('Get reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, operator_id, notes } = req.body;
    const validStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'boarded', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let idx = 2;

    if (operator_id) { updates.push(`operator_id = $${idx++}`); params.push(operator_id); }
    if (notes) { updates.push(`notes = $${idx++}`); params.push(notes); }

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE reservations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    res.json({ reservation: rows[0] });
  } catch (err) {
    console.error('Update reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { ref_code, pin } = req.body;
    const { rows } = await pool.query(
      'SELECT * FROM reservations WHERE ref_code = $1 AND pin = $2',
      [ref_code, pin]
    );

    if (rows.length === 0) {
      return res.json({ verified: false, error: 'Invalid reference or PIN' });
    }

    res.json({
      verified: true,
      reservation: {
        ref_code: rows[0].ref_code,
        category: rows[0].category,
        status: rows[0].status,
        payment_status: rows[0].payment_status,
        details: rows[0].details,
        route: rows[0].route,
        booking_date: rows[0].booking_date
      }
    });
  } catch (err) {
    console.error('Verify reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
