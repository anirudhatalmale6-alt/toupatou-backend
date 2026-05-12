const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Search hotels
router.get('/hotels', async (req, res) => {
  try {
    const { city, stars, checkin, checkout, guests } = req.query;
    let query = 'SELECT h.*, o.name as operator_name, o.verified as operator_verified FROM hotels h LEFT JOIN operators o ON h.operator_id = o.id WHERE h.active = true';
    const params = [];
    let idx = 1;

    if (city) { query += ` AND h.city = $${idx++}`; params.push(city); }
    if (stars) { query += ` AND h.stars >= $${idx++}`; params.push(parseInt(stars)); }

    query += ' ORDER BY h.rating DESC, h.stars DESC';
    const { rows } = await pool.query(query, params);
    res.json({ hotels: rows });
  } catch (err) {
    console.error('Search hotels error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search bus routes
router.get('/buses', async (req, res) => {
  try {
    const { from, to, date } = req.query;
    let query = `
      SELECT br.*, o.name as operator_name, o.verified as operator_verified
      FROM bus_routes br
      LEFT JOIN operators o ON br.operator_id = o.id
      WHERE br.active = true
    `;
    const params = [];
    let idx = 1;

    if (from) { query += ` AND br.from_city = $${idx++}`; params.push(from); }
    if (to) { query += ` AND br.to_city = $${idx++}`; params.push(to); }

    query += ' ORDER BY br.departure_time ASC';
    const { rows } = await pool.query(query, params);
    res.json({ routes: rows });
  } catch (err) {
    console.error('Search buses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search events
router.get('/events', async (req, res) => {
  try {
    const { city, category, from_date } = req.query;
    let query = `
      SELECT e.*, o.name as operator_name
      FROM events e
      LEFT JOIN operators o ON e.operator_id = o.id
      WHERE e.active = true AND e.event_date >= NOW()
    `;
    const params = [];
    let idx = 1;

    if (city) { query += ` AND e.city = $${idx++}`; params.push(city); }
    if (category) { query += ` AND e.category = $${idx++}`; params.push(category); }
    if (from_date) { query += ` AND e.event_date >= $${idx++}`; params.push(from_date); }

    query += ' ORDER BY e.event_date ASC';
    const { rows } = await pool.query(query, params);
    res.json({ events: rows });
  } catch (err) {
    console.error('Search events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search maritime routes
router.get('/maritime', async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = `
      SELECT mr.*, o.name as operator_name, o.verified as operator_verified
      FROM maritime_routes mr
      LEFT JOIN operators o ON mr.operator_id = o.id
      WHERE mr.active = true
    `;
    const params = [];
    let idx = 1;

    if (from) { query += ` AND mr.from_port = $${idx++}`; params.push(from); }
    if (to) { query += ` AND mr.to_port = $${idx++}`; params.push(to); }

    query += ' ORDER BY mr.departure_time ASC';
    const { rows } = await pool.query(query, params);
    res.json({ routes: rows });
  } catch (err) {
    console.error('Search maritime error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
