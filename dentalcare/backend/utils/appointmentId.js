function generateAppointmentId() {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `APT-${year}-${random}`;
}

module.exports = generateAppointmentId;
