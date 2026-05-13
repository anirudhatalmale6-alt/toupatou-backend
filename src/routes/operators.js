const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const { type, city, verified } = req.query;
    let query = 'SELECT * FROM operators WHERE active = true';
    const params = [];
    let idx = 1;

    if (type) { query += ` AND operator_type = $${idx++}`; params.push(type); }
    if (city) { query += ` AND city = $${idx++}`; params.push(city); }
    if (verified === 'true') { query += " AND verification_status = 'verified'"; }

    query += ' ORDER BY verification_status DESC, rating DESC, business_name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ operators: rows });
  } catch (err) {
    console.error('List operators error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { business_name, operator_type, owner_name, phone, whatsapp, email, address, city, description } = req.body;
    if (!business_name || !operator_type || !phone) {
      return res.status(400).json({ error: 'business_name, operator_type, and phone are required' });
    }

    const validTypes = ['airline', 'helicopter', 'hotel', 'bus', 'maritime', 'events', 'concierge', 'logistics', 'emergency'];
    if (!validTypes.includes(operator_type)) {
      return res.status(400).json({ error: 'Invalid operator type', valid: validTypes });
    }

    const { rows: [operator] } = await pool.query(`
      INSERT INTO operators (business_name, operator_type, owner_name, phone, whatsapp, email, address, city, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [business_name, operator_type, owner_name, phone, whatsapp || phone, email, address, city, description]);

    res.status(201).json({ operator });
  } catch (err) {
    console.error('Register operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['business_name', 'owner_name', 'phone', 'whatsapp', 'email', 'address', 'city', 'description', 'logo_url', 'details', 'payout_info', 'documents'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        params.push(['details', 'payout_info', 'documents'].includes(key) ? JSON.stringify(req.body[key]) : req.body[key]);
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

router.patch('/:id/verify', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'verified', 'rejected'];
    const newStatus = validStatuses.includes(status) ? status : 'verified';

    const { rows } = await pool.query(
      "UPDATE operators SET verification_status = $1, verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE verified_at END, updated_at = NOW() WHERE id = $2 RETURNING *",
      [newStatus, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    res.json({ operator: rows[0] });
  } catch (err) {
    console.error('Verify operator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/reservations', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT r.*, u.fullname as user_name, u.phone as user_phone
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

router.get('/:id/manifests', async (req, res) => {
  try {
    const { status, date } = req.query;
    let query = 'SELECT * FROM manifests WHERE operator_id = $1';
    const params = [req.params.id];
    let idx = 2;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (date) { query += ` AND DATE(departure_time) = $${idx++}`; params.push(date); }

    query += ' ORDER BY departure_time ASC';
    const { rows } = await pool.query(query, params);
    res.json({ manifests: rows });
  } catch (err) {
    console.error('Get operator manifests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
