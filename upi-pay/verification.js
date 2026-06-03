/**
 * @typedef {Object} EmailPaymentData
 * @property {string} creditorName
 * @property {number} amount
 * @property {Date} timestamp
 */

/**
 * @typedef {Object} OrderData
 * @property {string} id
 * @property {string} name
 * @property {number} amount
 * @property {string} status
 * @property {number} createdAt
 */

const VERIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10 Minutes

/**
 * Validates the extracted email payment data.
 * @param {string} name 
 * @param {number} amount 
 * @returns {{valid: boolean, error?: string}}
 */
function validatePaymentData(name, amount) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: "Invalid creditor name" };
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return { valid: false, error: "Invalid amount" };
  }
  return { valid: true };
}

/**
 * Checks if an order matches the payment criteria.
 * @param {EmailPaymentData} payment 
 * @param {OrderData} order 
 * @returns {boolean}
 */
function matchOrder(payment, order) {
  // 1. Check Status
  if (order.status !== 'PENDING') return false;

  // 2. Check Amount (Exact match)
  if (order.amount !== payment.amount) return false;

  // 3. Check Name (Case insensitive)
  if (order.name.toUpperCase() !== payment.creditorName.toUpperCase()) return false;

  // 4. Check Time Window
  const orderTime = order.createdAt;
  const now = Date.now();
  // Ensure order is not in the future (sanity check) and within the window
  if (orderTime > now) return false;
  if (now - orderTime > VERIFICATION_WINDOW_MS) return false;

  return true;
}

module.exports = {
  validatePaymentData,
  matchOrder,
  VERIFICATION_WINDOW_MS
};
