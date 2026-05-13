const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.post('/', async (req, res) => {
  try {
    const { route, operator_id, departure_time, seats_total, driver_name, driver_phone, vehicle_plate, checkpoints } = req.body;
    if (!route || !operator_id || !departure_time) {
      return res.status(400).json({ error: 'route, operator_id, and departure_time are required' });
    }

    const { rows: [manifest] } = await pool.query(`
      INSERT INTO manifests (route, operator_id, departure_time, seats_total, driver_name, driver_phone, vehicle_plate, checkpoints)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [route, operator_id, departure_time, seats_total || 45, driver_name, driver_phone, vehicle_plate, JSON.stringify(checkpoints || [])]);

    res.status(201).json({ manifest });
  } catch (err) {
    console.error('Create manifest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { operator_id, status, date } = req.query;
    let query = `
      SELECT m.*, o.business_name as operator_name
      FROM manifests m
      LEFT JOIN operators o ON m.operator_id = o.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (operator_id) { query += ` AND m.operator_id = $${idx++}`; params.push(operator_id); }
    if (status) { query += ` AND m.status = $${idx++}`; params.push(status); }
    if (date) { query += ` AND DATE(m.departure_time) = $${idx++}`; params.push(date); }

    query += ' ORDER BY m.departure_time ASC';
    const { rows } = await pool.query(query, params);
    res.json({ manifests: rows });
  } catch (err) {
    console.error('List manifests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, o.business_name as operator_name
      FROM manifests m
      LEFT JOIN operators o ON m.operator_id = o.id
      WHERE m.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Manifest not found' });
    res.json({ manifest: rows[0] });
  } catch (err) {
    console.error('Get manifest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['scheduled', 'boarding', 'departed', 'in_transit', 'arrived', 'delayed', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid });
    }

    const { rows } = await pool.query(
      'UPDATE manifests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Manifest not found' });
    res.json({ manifest: rows[0] });
  } catch (err) {
    console.error('Update manifest status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/board', async (req, res) => {
  try {
    const { ref_code, seat, luggage_count } = req.body;
    if (!ref_code) return res.status(400).json({ error: 'ref_code is required' });

    const { rows: resRows } = await pool.query(
      "SELECT r.*, u.fullname as passenger_name, u.phone as passenger_phone FROM reservations r LEFT JOIN users u ON r.user_id = u.id WHERE r.ref_code = $1 AND r.status IN ('confirmed', 'pending')",
      [ref_code]
    );
    if (resRows.length === 0) {
      return res.status(404).json({ error: 'Valid reservation not found' });
    }

    const reservation = resRows[0];
    const passenger = {
      ref_code,
      name: reservation.passenger_name,
      phone: reservation.passenger_phone,
      seat: seat || null,
      luggage: luggage_count || 0,
      boarded_at: new Date().toISOString()
    };

    const { rows } = await pool.query(`
      UPDATE manifests
      SET passengers = passengers || $1::jsonb,
          seats_boarded = seats_boarded + 1,
          luggage_count = luggage_count + $2,
          updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [JSON.stringify(passenger), luggage_count || 0, req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Manifest not found' });

    await pool.query("UPDATE reservations SET status = 'boarded', updated_at = NOW() WHERE ref_code = $1", [ref_code]);

    res.json({ manifest: rows[0], boarded: passenger });
  } catch (err) {
    console.error('Board passenger error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['driver_name', 'driver_phone', 'vehicle_plate', 'notes', 'checkpoints', 'seats_sold'];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        params.push(key === 'checkpoints' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE manifests SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Manifest not found' });
    res.json({ manifest: rows[0] });
  } catch (err) {
    console.error('Update manifest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
