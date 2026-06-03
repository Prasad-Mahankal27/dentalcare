const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { validatePaymentData, matchOrder, VERIFICATION_WINDOW_MS } = require('./verification');

describe('Payment Verification System', () => {

  describe('validatePaymentData', () => {
    it('should validate correct data', () => {
      const result = validatePaymentData('Alice', 100);
      assert.strictEqual(result.valid, true);
    });

    it('should fail on empty name', () => {
      const result = validatePaymentData('', 100);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid creditor name');
    });

    it('should fail on invalid amount', () => {
      const result = validatePaymentData('Alice', -50);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid amount');
    });

    it('should fail on zero amount', () => {
      const result = validatePaymentData('Alice', 0);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('matchOrder', () => {
    const now = Date.now();
    const validOrder = {
      id: '123',
      name: 'BOB',
      amount: 500,
      status: 'PENDING',
      createdAt: now - 10000 // 10 seconds ago
    };

    const payment = {
      creditorName: 'Bob',
      amount: 500,
      timestamp: new Date()
    };

    it('should match a valid pending order', () => {
      assert.strictEqual(matchOrder(payment, validOrder), true);
    });

    it('should not match if status is not PENDING', () => {
      const paidOrder = { ...validOrder, status: 'PAID' };
      assert.strictEqual(matchOrder(payment, paidOrder), false);
    });

    it('should not match if amount matches but name is different', () => {
      const wrongNameOrder = { ...validOrder, name: 'CHARLIE' };
      assert.strictEqual(matchOrder(payment, wrongNameOrder), false);
    });

    it('should not match if name matches but amount is different', () => {
      const wrongAmountOrder = { ...validOrder, amount: 100 };
      assert.strictEqual(matchOrder(payment, wrongAmountOrder), false);
    });

    it('should not match if order is older than 10 minutes', () => {
      const oldOrder = { 
        ...validOrder, 
        createdAt: now - (VERIFICATION_WINDOW_MS + 1000) 
      };
      assert.strictEqual(matchOrder(payment, oldOrder), false);
    });
  });
});
