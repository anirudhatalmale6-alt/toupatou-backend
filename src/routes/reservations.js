const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateQR, generateRefCode, generatePIN } = require('../services/qr');

// Create a reservation
router.post('/', async (req, res) => {
  try {
    const { category, phone, name, details, passengers, source } = req.body;

    if (!category || !phone) {
      return res.status(400).json({ error: 'category and phone are required' });
    }

    // Find or create user
    let user;
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.length > 0) {
      user = existing[0];
      if (name && !user.name) {
        await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, user.id]);
      }
    } else {
      const { rows: [newUser] } = await pool.query(
        'INSERT INTO users (name, phone) VALUES ($1, $2) RETURNING *',
        [name || null, phone]
      );
      user = newUser;
    }

    const refCode = generateRefCode(category);
    const pin = generatePIN();
    const qrData = await generateQR({ ref: refCode, cat: category, pin });

    const { rows: [reservation] } = await pool.query(`
      INSERT INTO reservations (ref_code, user_id, category, details, passengers, pin, qr_code, source, booking_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      refCode, user.id, category,
      JSON.stringify(details || {}),
      passengers || 1, pin, qrData,
      source || 'web',
      details?.date ? new Date(details.date) : new Date()
    ]);

    res.status(201).json({
      success: true,
      reservation: {
        id: reservation.id,
        ref_code: reservation.ref_code,
        category: reservation.category,
        status: reservation.status,
        pin: reservation.pin,
        qr_code: reservation.qr_code,
        details: reservation.details,
        booking_date: reservation.booking_date,
        created_at: reservation.created_at
      }
    });
  } catch (err) {
    console.error('Create reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all reservations (admin)
router.get('/', async (req, res) => {
  try {
    const { category, status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT r.*, u.name as user_name, u.phone as user_phone,
             o.name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (category) {
      query += ` AND r.category = $${idx++}`;
      params.push(category);
    }
    if (status) {
      query += ` AND r.status = $${idx++}`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*) FROM reservations' +
      (category ? ` WHERE category = '${category}'` : '') +
      (status ? ` ${category ? 'AND' : 'WHERE'} status = '${status}'` : '')
    );

    res.json({ reservations: rows, total: parseInt(count) });
  } catch (err) {
    console.error('List reservations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reservation by ref code
router.get('/ref/:refCode', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.name as user_name, u.phone as user_phone,
             o.name as operator_name
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

// Get user's reservations by phone
router.get('/user/:phone', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, o.name as operator_name
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

// Get single reservation
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.name as user_name, u.phone as user_phone,
             o.name as operator_name
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

// Update reservation status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, operator_id, notes } = req.body;
    const validStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let idx = 2;

    if (operator_id) {
      updates.push(`operator_id = $${idx++}`);
      params.push(operator_id);
    }
    if (notes) {
      updates.push(`notes = $${idx++}`);
      params.push(notes);
    }

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

// Verify reservation by PIN
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
        details: rows[0].details,
        booking_date: rows[0].booking_date
      }
    });
  } catch (err) {
    console.error('Verify reservation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
