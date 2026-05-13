const pool = require('./pool');

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        fullname VARCHAR(255),
        phone VARCHAR(30) NOT NULL UNIQUE,
        whatsapp VARCHAR(30),
        email VARCHAR(255),
        password_hash VARCHAR(255),
        pin VARCHAR(6),
        role VARCHAR(30) DEFAULT 'user',
        language VARCHAR(5) DEFAULT 'ht',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operators (
        id SERIAL PRIMARY KEY,
        business_name VARCHAR(255) NOT NULL,
        operator_type VARCHAR(30) NOT NULL,
        owner_name VARCHAR(255),
        phone VARCHAR(30),
        whatsapp VARCHAR(30),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        description TEXT,
        logo_url VARCHAR(500),
        verification_status VARCHAR(20) DEFAULT 'pending',
        verified_at TIMESTAMPTZ,
        documents JSONB DEFAULT '[]',
        payout_info JSONB DEFAULT '{}',
        rating NUMERIC(2,1) DEFAULT 0,
        review_count INT DEFAULT 0,
        details JSONB DEFAULT '{}',
        password_hash VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_operators_type ON operators(operator_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_operators_city ON operators(city)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bus_routes (
        id SERIAL PRIMARY KEY,
        operator_id INT REFERENCES operators(id),
        from_city VARCHAR(100) NOT NULL,
        to_city VARCHAR(100) NOT NULL,
        route_code VARCHAR(20),
        departure_time TIME,
        arrival_time TIME,
        days_of_week VARCHAR(20) DEFAULT 'daily',
        price_htg NUMERIC(10,2),
        price_usd NUMERIC(10,2),
        seats_total INT DEFAULT 45,
        luggage_included INT DEFAULT 1,
        luggage_extra_price NUMERIC(10,2) DEFAULT 0,
        amenities JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS hotels (
        id SERIAL PRIMARY KEY,
        operator_id INT REFERENCES operators(id),
        name VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        address TEXT,
        stars INT DEFAULT 3,
        price_min NUMERIC(10,2),
        price_max NUMERIC(10,2),
        currency VARCHAR(5) DEFAULT 'USD',
        amenities JSONB DEFAULT '[]',
        photos JSONB DEFAULT '[]',
        phone VARCHAR(30),
        whatsapp VARCHAR(30),
        rooms_total INT DEFAULT 0,
        rating NUMERIC(2,1) DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        operator_id INT REFERENCES operators(id),
        name VARCHAR(255) NOT NULL,
        city VARCHAR(100) NOT NULL,
        venue VARCHAR(255),
        event_date TIMESTAMPTZ NOT NULL,
        category VARCHAR(30),
        description TEXT,
        price_htg NUMERIC(10,2),
        price_usd NUMERIC(10,2),
        photos JSONB DEFAULT '[]',
        tickets_total INT DEFAULT 0,
        tickets_sold INT DEFAULT 0,
        packages JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_city ON events(city)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS maritime_routes (
        id SERIAL PRIMARY KEY,
        operator_id INT REFERENCES operators(id),
        from_port VARCHAR(100) NOT NULL,
        to_port VARCHAR(100) NOT NULL,
        vessel_name VARCHAR(255),
        vessel_type VARCHAR(50),
        departure_time TIME,
        days_of_week VARCHAR(20) DEFAULT 'daily',
        passenger_capacity INT DEFAULT 0,
        cargo_capacity_lbs INT DEFAULT 0,
        price_passenger NUMERIC(10,2),
        price_cargo_per_lb NUMERIC(10,2),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        ref_code VARCHAR(20) NOT NULL UNIQUE,
        user_id INT REFERENCES users(id),
        operator_id INT REFERENCES operators(id),
        category VARCHAR(30) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        payment_status VARCHAR(20) DEFAULT 'unpaid',
        booking_date TIMESTAMPTZ,
        details JSONB DEFAULT '{}',
        route VARCHAR(255),
        passengers INT DEFAULT 1,
        seats JSONB DEFAULT '[]',
        total_amount NUMERIC(10,2) DEFAULT 0,
        currency VARCHAR(5) DEFAULT 'HTG',
        qr_code TEXT,
        pin VARCHAR(6),
        notes TEXT,
        source VARCHAR(20) DEFAULT 'web',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reservations_operator ON reservations(operator_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reservations_category ON reservations(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reservations_ref ON reservations(ref_code)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        reservation_id INT REFERENCES reservations(id),
        user_id INT REFERENCES users(id),
        amount NUMERIC(10,2) NOT NULL,
        currency VARCHAR(5) DEFAULT 'HTG',
        method VARCHAR(30) NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        reference VARCHAR(255),
        provider_ref VARCHAR(255),
        proof_upload VARCHAR(500),
        verified_by INT REFERENCES users(id),
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments(reservation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS manifests (
        id SERIAL PRIMARY KEY,
        route VARCHAR(255) NOT NULL,
        operator_id INT REFERENCES operators(id),
        departure_time TIMESTAMPTZ NOT NULL,
        arrival_time TIMESTAMPTZ,
        passengers JSONB DEFAULT '[]',
        luggage_count INT DEFAULT 0,
        seats_total INT DEFAULT 45,
        seats_sold INT DEFAULT 0,
        seats_boarded INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'scheduled',
        driver_name VARCHAR(255),
        driver_phone VARCHAR(30),
        vehicle_plate VARCHAR(30),
        checkpoints JSONB DEFAULT '[]',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_manifests_operator ON manifests(operator_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_manifests_status ON manifests(status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id SERIAL PRIMARY KEY,
        ref_code VARCHAR(20) NOT NULL,
        scan_type VARCHAR(30) NOT NULL,
        scanner_id INT REFERENCES users(id),
        result VARCHAR(20) NOT NULL,
        details JSONB DEFAULT '{}',
        scanned_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scans_ref ON scan_logs(ref_code)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        reservation_id INT REFERENCES reservations(id),
        category VARCHAR(50),
        subject VARCHAR(255),
        message TEXT,
        status VARCHAR(20) DEFAULT 'open',
        priority VARCHAR(20) DEFAULT 'normal',
        assigned_to INT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: existingOps } = await client.query('SELECT COUNT(*) FROM operators');
    if (parseInt(existingOps[0].count) === 0) {
      await seedData(client);
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function seedData(client) {
  const bcrypt = require('bcryptjs');
  const adminHash = await bcrypt.hash('toupatou2026', 10);

  await client.query(`
    INSERT INTO users (fullname, phone, whatsapp, email, password_hash, role, language)
    VALUES ('TouPaTou Admin', '+50941902005', '50941902005', 'admin@toupatou.com', $1, 'admin', 'ht')
  `, [adminHash]);

  const { rows: [busOp] } = await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('Caribe Tours Haiti', 'bus', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Service de bus international Haiti-RD', 'Jean-Pierre Duval')
    RETURNING id
  `);

  const busRoutes = [
    ['Port-au-Prince', 'Santo Domingo', 'PAP-SDQ', '06:00', '12:00', 2500, 45],
    ['Port-au-Prince', 'Santo Domingo', 'PAP-SDQ', '14:00', '20:00', 2500, 45],
    ['Port-au-Prince', 'Santiago', 'PAP-STI', '07:00', '14:00', 3000, 40],
    ['Cap-Haitien', 'Santo Domingo', 'CAP-SDQ', '05:30', '14:30', 3500, 40],
    ['Cap-Haitien', 'Santiago', 'CAP-STI', '06:00', '12:00', 2800, 40],
  ];
  for (const [from, to, code, dep, arr, price, seats] of busRoutes) {
    await client.query(`
      INSERT INTO bus_routes (operator_id, from_city, to_city, route_code, departure_time, arrival_time, price_htg, seats_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [busOp.id, from, to, code, dep, arr, price, seats]);
  }

  await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('Haiti Air VIP', 'helicopter', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Service helicoptere VIP, medical, tourisme', 'Marc Antoine')
  `);

  const { rows: [hotelOp] } = await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('TouPaTou Hotels', 'hotel', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Reseau hotels partenaires', 'TouPaTou Team')
    RETURNING id
  `);

  const hotels = [
    ['Royal Oasis', 'Petion-Ville', 5, 150, 450, 'USD'],
    ['Marriott Port-au-Prince', 'Port-au-Prince', 5, 180, 500, 'USD'],
    ['Hotel Montana', 'Petion-Ville', 4, 100, 250, 'USD'],
    ['Habitation des Lauriers', 'Cap-Haitien', 4, 85, 200, 'USD'],
    ['Hotel Cyvadier', 'Jacmel', 3, 60, 150, 'USD'],
    ['Auberge de la Visite', 'Les Cayes', 3, 50, 120, 'USD'],
  ];
  for (const [name, city, stars, min, max, cur] of hotels) {
    await client.query(`
      INSERT INTO hotels (operator_id, name, city, stars, price_min, price_max, currency, amenities)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [hotelOp.id, name, city, stars, min, max, cur, JSON.stringify(['wifi', 'pool', 'restaurant', 'parking'])]);
  }

  const { rows: [maritimeOp] } = await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('Haiti Maritime Transport', 'maritime', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Transport maritime passagers et fret', 'Robert Charles')
    RETURNING id
  `);

  const maritimeRoutes = [
    ['Port-au-Prince', 'Ile de la Gonave', '08:00', 50, 5000, 500, 5],
    ['Port-au-Prince', 'Jeremie', '06:00', 80, 10000, 1500, 8],
    ['Cap-Haitien', 'La Tortue', '09:00', 30, 2000, 300, 3],
    ['Les Cayes', 'Ile-a-Vache', '07:30', 40, 3000, 800, 5],
  ];
  for (const [from, to, dep, pax, cargo, price, priceCargo] of maritimeRoutes) {
    await client.query(`
      INSERT INTO maritime_routes (operator_id, from_port, to_port, departure_time, passenger_capacity, cargo_capacity_lbs, price_passenger, price_cargo_per_lb)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [maritimeOp.id, from, to, dep, pax, cargo, price, priceCargo]);
  }

  await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('TouPaTou Concierge', 'concierge', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Services VIP: aeroport, chauffeur, reservations, business', 'TouPaTou Team')
  `);

  const { rows: [eventOp] } = await client.query(`
    INSERT INTO operators (business_name, operator_type, phone, whatsapp, city, verification_status, description, owner_name)
    VALUES ('Tike Lakay Events', 'events', '+50941902005', '50941902005', 'Port-au-Prince', 'verified', 'Evenements et packages', 'Marie Duval')
    RETURNING id
  `);

  const events = [
    ['Konpa Festival 2026', 'Port-au-Prince', 'Parc Historique', '2026-07-15 20:00', 'music', 2500, 500],
    ['Haiti Jazz Festival', 'Petion-Ville', 'Hotel Montana', '2026-08-10 19:00', 'music', 5000, 300],
    ['Fete de la Musique', 'Cap-Haitien', "Place d'Armes", '2026-06-21 18:00', 'culture', 1000, 1000],
    ['Haiti Business Summit', 'Port-au-Prince', 'Marriott', '2026-09-05 09:00', 'business', 15000, 200],
  ];
  for (const [name, city, venue, date, cat, price, tickets] of events) {
    await client.query(`
      INSERT INTO events (operator_id, name, city, venue, event_date, category, price_htg, tickets_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [eventOp.id, name, city, venue, date, cat, price, tickets]);
  }

  console.log('Seed data inserted successfully');
}

module.exports = { initDatabase };
