const WA_NUM = '50941902005';

function buildWhatsAppLink(message) {
  return `https://wa.me/${WA_NUM}?text=${encodeURIComponent(message)}`;
}

function reservationNotification(reservation) {
  const { ref_code, category, details, status } = reservation;
  let msg = `TouPaTou - Nouvo Rezèvasyon!\n\n`;
  msg += `Ref: ${ref_code}\n`;
  msg += `Kategori: ${category}\n`;
  msg += `Estati: ${status}\n`;

  if (details) {
    if (details.from) msg += `Soti: ${details.from}\n`;
    if (details.to) msg += `Ale: ${details.to}\n`;
    if (details.date) msg += `Dat: ${details.date}\n`;
    if (details.time) msg += `Lè: ${details.time}\n`;
    if (details.passengers) msg += `Pasaje: ${details.passengers}\n`;
    if (details.city) msg += `Vil: ${details.city}\n`;
    if (details.service) msg += `Sèvis: ${details.service}\n`;
  }

  return buildWhatsAppLink(msg);
}

module.exports = { buildWhatsAppLink, reservationNotification, WA_NUM };
