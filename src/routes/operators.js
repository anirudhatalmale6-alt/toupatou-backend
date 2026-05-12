const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// List operators
router.get('/', async (req, res) => {
  try {
    const { type, city, verified } = req.query;
    let query = 'SELECT * FROM operators WHERE active = true';
    const params = [];
    let idx = 1;

    if (type) { query += ` AND type = $${idx++}`; params.push(type); }
    if (city) { query += ` AND city = $${idx++}`; params.push(city); }
    if (verified === 'true') { query += ' AND verified = true'; }

    query += ' ORDER BY verified DESC, rating DESC, name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ operators: rows });
  } catch (err) {
    console.error('List operators error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register operator
router.post('/', async (req, res) => {
  try {
    const { name, type, phone, whatsapp, email, city, description } = req.body;
    if (!name || !type || !phone) {
      return res.status(400).json({ error: 'name, type, and phone are required' });
    }

    const validTypes = ['airline', 'helicopter', 'hotel', 'bus', 'maritime', 'events', 'concierge'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid operator type', valid: validTypes });
    }

    const { rows: [operator] } = await pool.query(`
      INSERT INTO operators (name, type, phone, whatsapp, email, city, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [name, type, phone, whatsapp || phone, email, city, description]);

    res.status(201).json({ operator });
  } catch (err) {
    console.error('Register operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get operator by ID
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM operators WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    res.json({ operator: rows[0] });
  } catch (err) {
    console.error('Get operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update operator
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'whatsapp', 'email', 'city', 'description', 'logo_url', 'details'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        params.push(key === 'details' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE operators SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    res.json({ operator: rows[0] });
  } catch (err) {
    console.error('Update operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify operator (admin)
router.patch('/:id/verify', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE operators SET verified = true, verified_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    res.json({ operator: rows[0] });
  } catch (err) {
    console.error('Verify operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get operator's reservations
router.get('/:id/reservations', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT r.*, u.name as user_name, u.phone as user_phone
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.operator_id = $1
    `;
    const params = [req.params.id];
    let idx = 2;

    if (status) { query += ` AND r.status = $${idx++}`; params.push(status); }
    query += ` ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    res.json({ reservations: rows });
  } catch (err) {
    console.error('Get operator reservations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
