const QRCode = require('qrcode');

async function generateQR(data) {
  try {
    return await QRCode.toDataURL(JSON.stringify(data), {
      width: 300,
      margin: 2,
      color: { dark: '#00209F', light: '#FFFFFF' }
    });
  } catch (err) {
    console.error('QR generation error:', err);
    return null;
  }
}

function generateRefCode(category) {
  const prefixes = {
    flight: 'FLT', helicopter: 'HEL', hotel: 'HTL', bus: 'BUS',
    emergency: 'HRO', events: 'EVT', maritime: 'MAR', concierge: 'VIP'
  };
  const prefix = prefixes[category] || 'TPT';
  const num = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${num}`;
}

function generatePIN() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { generateQR, generateRefCode, generatePIN };
