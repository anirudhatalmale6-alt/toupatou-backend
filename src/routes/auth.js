const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { generateToken, authenticate } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { fullname, phone, whatsapp, email, password, language } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Phone already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const pin = String(Math.floor(100000 + Math.random() * 900000));

    const { rows: [user] } = await pool.query(`
      INSERT INTO users (fullname, phone, whatsapp, email, password_hash, pin, language)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, fullname, phone, role, language, created_at
    `, [fullname, phone, whatsapp || phone, email, hash, pin, language || 'ht']);

    const token = generateToken({ id: user.id, phone: user.phone, role: user.role });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Account not set up for password login' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.id, phone: user.phone, role: user.role });
    res.json({
      user: { id: user.id, fullname: user.fullname, phone: user.phone, role: user.role, language: user.language },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/operator/register', async (req, res) => {
  try {
    const { business_name, operator_type, owner_name, phone, whatsapp, email, address, city, description, password } = req.body;
    if (!business_name || !operator_type || !phone || !password) {
      return res.status(400).json({ error: 'business_name, operator_type, phone, and password are required' });
    }

    const validTypes = ['airline', 'helicopter', 'hotel', 'bus', 'maritime', 'events', 'concierge', 'logistics', 'emergency'];
    if (!validTypes.includes(operator_type)) {
      return res.status(400).json({ error: 'Invalid operator type', valid: validTypes });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows: [operator] } = await pool.query(`
      INSERT INTO operators (business_name, operator_type, owner_name, phone, whatsapp, email, address, city, description, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, business_name, operator_type, owner_name, phone, verification_status, created_at
    `, [business_name, operator_type, owner_name, phone, whatsapp || phone, email, address, city, description, hash]);

    let user;
    const { rows: existingUser } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existingUser.length > 0) {
      await pool.query("UPDATE users SET role = 'operator' WHERE id = $1", [existingUser[0].id]);
      user = existingUser[0];
    } else {
      const { rows: [newUser] } = await pool.query(`
        INSERT INTO users (fullname, phone, whatsapp, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, 'operator') RETURNING *
      `, [owner_name, phone, whatsapp || phone, email, hash]);
      user = newUser;
    }

    const token = generateToken({ id: user.id, phone: user.phone, role: 'operator', operator_id: operator.id });
    res.status(201).json({ operator, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Phone already registered' });
    }
    console.error('Operator register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/operator/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM operators WHERE phone = $1 AND active = true', [phone]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const operator = rows[0];
    if (!operator.password_hash) {
      return res.status(401).json({ error: 'Account not set up' });
    }

    const valid = await bcrypt.compare(password, operator.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { rows: userRows } = await pool.query('SELECT id, role FROM users WHERE phone = $1', [phone]);
    const userId = userRows.length > 0 ? userRows[0].id : null;

    const token = generateToken({ id: userId, phone: operator.phone, role: 'operator', operator_id: operator.id });
    res.json({
      operator: {
        id: operator.id, business_name: operator.business_name, operator_type: operator.operator_type,
        owner_name: operator.owner_name, phone: operator.phone, verification_status: operator.verification_status
      },
      token
    });
  } catch (err) {
    console.error('Operator login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, fullname, phone, whatsapp, email, role, language, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
