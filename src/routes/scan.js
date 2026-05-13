const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.post('/validate', async (req, res) => {
  try {
    const { ref_code, scan_type, scanner_id } = req.body;
    if (!ref_code) return res.status(400).json({ error: 'ref_code is required' });

    const type = scan_type || 'general';

    const { rows } = await pool.query(`
      SELECT r.*, u.fullname as passenger_name, u.phone as passenger_phone,
             o.business_name as operator_name
      FROM reservations r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN operators o ON r.operator_id = o.id
      WHERE r.ref_code = $1
    `, [ref_code]);

    if (rows.length === 0) {
      await logScan(ref_code, type, scanner_id, 'invalid', { reason: 'not_found' });
      return res.json({ valid: false, result: 'invalid', reason: 'Reservation not found' });
    }

    const reservation = rows[0];

    if (reservation.status === 'cancelled') {
      await logScan(ref_code, type, scanner_id, 'invalid', { reason: 'cancelled' });
      return res.json({ valid: false, result: 'invalid', reason: 'Reservation cancelled' });
    }

    if (reservation.status === 'boarded' && type === 'boarding') {
      await logScan(ref_code, type, scanner_id, 'used', { reason: 'already_boarded' });
      return res.json({ valid: false, result: 'used', reason: 'Already boarded' });
    }

    if (reservation.status === 'completed') {
      await logScan(ref_code, type, scanner_id, 'used', { reason: 'already_used' });
      return res.json({ valid: false, result: 'used', reason: 'Already used' });
    }

    if (reservation.payment_status !== 'paid' && reservation.payment_status !== 'unpaid') {
      // Allow unpaid for cash-on-arrival scenarios
    }

    await logScan(ref_code, type, scanner_id, 'valid', {
      category: reservation.category,
      status: reservation.status
    });

    res.json({
      valid: true,
      result: 'valid',
      reservation: {
        ref_code: reservation.ref_code,
        category: reservation.category,
        status: reservation.status,
        payment_status: reservation.payment_status,
        passenger_name: reservation.passenger_name,
        passenger_phone: reservation.passenger_phone,
        operator_name: reservation.operator_name,
        details: reservation.details,
        seats: reservation.seats,
        booking_date: reservation.booking_date,
        passengers: reservation.passengers
      }
    });
  } catch (err) {
    console.error('Validate scan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/board', async (req, res) => {
  try {
    const { ref_code, scanner_id } = req.body;
    if (!ref_code) return res.status(400).json({ error: 'ref_code is required' });

    const { rows } = await pool.query(
      "UPDATE reservations SET status = 'boarded', updated_at = NOW() WHERE ref_code = $1 AND status IN ('confirmed', 'pending') RETURNING *",
      [ref_code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found or already boarded' });
    }

    await logScan(ref_code, 'boarding', scanner_id, 'boarded', {});
    res.json({ success: true, reservation: rows[0] });
  } catch (err) {
    console.error('Board error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { scanner_id, limit = 50 } = req.query;
    let query = 'SELECT * FROM scan_logs';
    const params = [];
    let idx = 1;

    if (scanner_id) {
      query += ` WHERE scanner_id = $${idx++}`;
      params.push(scanner_id);
    }

    query += ` ORDER BY scanned_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const { rows } = await pool.query(query, params);
    res.json({ scans: rows });
  } catch (err) {
    console.error('Scan history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function logScan(ref_code, scan_type, scanner_id, result, details) {
  try {
    await pool.query(
      'INSERT INTO scan_logs (ref_code, scan_type, scanner_id, result, details) VALUES ($1, $2, $3, $4, $5)',
      [ref_code, scan_type, scanner_id || null, result, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Log scan error:', err);
  }
}

module.exports = router;
